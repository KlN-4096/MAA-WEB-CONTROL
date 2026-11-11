from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
import smtplib
import ssl
import time
from contextlib import contextmanager
from email.message import EmailMessage
from http.client import HTTPException
from typing import Any
from urllib import parse, request

from .models import NotificationChannel


HTTP_TIMEOUT_SECONDS = 10
MAX_RESPONSE_BYTES = 1024 * 1024
STORED_SECRET = "******** (已保存)"
SECRET_OPTION_KEYS = {"password", "token", "bot_token", "send_key", "key", "access_token", "secret"}


class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


@contextmanager
def open_without_redirect(req: request.Request):
    try:
        with request.build_opener(NoRedirect()).open(req, timeout=HTTP_TIMEOUT_SECONDS) as response:
            yield response
    except HTTPException as exc:
        raise OSError("通知/远控服务返回无效 HTTP 响应") from exc


def validate_http_url(url: str) -> str:
    parsed = parse.urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("通知/远控地址必须为不含用户名密码的 HTTP(S) URL。")
    return url


def post_json(url: str, body: dict[str, Any], headers: dict[str, str] | None = None, *, form: bool = False) -> dict[str, Any]:
    validate_http_url(url)
    data = parse.urlencode(body).encode() if form else json.dumps(body, ensure_ascii=False).encode()
    req = request.Request(url, data=data, method="POST", headers={
        "Content-Type": "application/x-www-form-urlencoded" if form else "application/json",
        **(headers or {}),
    })
    with open_without_redirect(req) as response:
        raw = response.read(MAX_RESPONSE_BYTES + 1)
    if len(raw) > MAX_RESPONSE_BYTES:
        raise ValueError("服务响应超过上限")
    result = json.loads(raw) if raw else {}
    if not isinstance(result, dict):
        raise ValueError("服务响应格式错误")
    return result


def send_channel(channel: NotificationChannel, title: str, content: str) -> None:
    options = channel.options

    def required(key: str) -> str:
        value = str(options.get(key, "")).strip()
        if not value:
            raise ValueError(f"{channel.type} 缺少 {key}")
        return value

    def server(default: str = "") -> str:
        return validate_http_url(str(options.get("server") or default)).rstrip("/")

    kind = channel.type
    if kind == "smtp":
        message = EmailMessage()
        message["Subject"] = title
        message["From"] = required("from")
        recipients = [item.strip() for item in re.split(r"[,;]", required("to")) if item.strip()]
        message["To"] = ", ".join(recipients)
        message.set_content(content)
        use_ssl = bool(options.get("use_ssl", True))
        smtp_class = smtplib.SMTP_SSL if use_ssl else smtplib.SMTP
        kwargs = {"timeout": HTTP_TIMEOUT_SECONDS}
        if use_ssl:
            kwargs["context"] = ssl.create_default_context()
        with smtp_class(required("server"), int(options.get("port", 465 if use_ssl else 587)), **kwargs) as smtp:
            if not use_ssl and options.get("starttls", True):
                smtp.starttls(context=ssl.create_default_context())
            if options.get("requires_authentication", True):
                smtp.login(required("username"), required("password"))
            smtp.send_message(message, to_addrs=recipients)
        return
    if kind == "telegram":
        body = {"chat_id": required("chat_id"), "text": f"{title}\n{content}"[:4096]}
        if options.get("topic_id"):
            body["message_thread_id"] = int(options["topic_id"])
        result = post_json(f"https://api.telegram.org/bot{parse.quote(required('bot_token'), safe=':')}/sendMessage", body)
        ok = result.get("ok") is True
    elif kind == "bark":
        result = post_json(f"{server('https://api.day.app')}/push", {
            "device_key": required("send_key"), "title": title, "body": content,
            **{key: options[key] for key in ("group", "icon") if options.get(key)},
        })
        ok = result.get("code") == 200
    elif kind == "gotify":
        result = post_json(f"{server()}/message", {"title": title, "message": content}, {"X-Gotify-Key": required("token")})
        ok = type(result.get("id")) is int
    elif kind == "qmsg":
        result = post_json(f"{server('https://qmsg.zendee.cn')}/jsend/{parse.quote(required('key'), safe='')}", {
            "msg": f"{title}\n{content}", "qq": required("user"), "bot": required("bot"),
        })
        ok = result.get("success") is True
    elif kind == "serverchan":
        key = required("send_key")
        match = re.match(r"^sctp(\d+)t", key)
        base = f"https://{match[1]}.push.ft07.com/send" if match else "https://sctapi.ftqq.com"
        result = post_json(f"{base}/{parse.quote(key, safe='')}.send", {"text": title, "desp": content}, form=True)
        ok = result.get("code") == 0
    elif kind == "discord":
        headers = {"Authorization": f"Bot {required('bot_token')}"}
        channel_result = post_json("https://discord.com/api/v10/users/@me/channels", {"recipient_id": required("user_id")}, headers)
        channel_id = str(channel_result.get("id", ""))
        if not channel_id.isdigit():
            raise ValueError("Discord 未返回私信频道")
        result = post_json(f"https://discord.com/api/v10/channels/{channel_id}/messages", {"content": f"{title}\n{content}"[:2000]}, headers)
        ok = bool(result.get("id"))
    elif kind == "dingtalk":
        query = {"access_token": required("access_token")}
        secret = str(options.get("secret", ""))
        if secret:
            timestamp = str(int(time.time() * 1000))
            query.update(timestamp=timestamp, sign=base64.b64encode(hmac.new(secret.encode(), f"{timestamp}\n{secret}".encode(), hashlib.sha256).digest()).decode())
        result = post_json(f"https://oapi.dingtalk.com/robot/send?{parse.urlencode(query)}", {"msgtype": "text", "text": {"content": f"{title}\n{content}"}})
        ok = result.get("errcode") == 0
    else:
        raise ValueError("未知通知渠道")
    if not ok:
        # 不转发供应商响应或 URL，里面可能含有密钥。
        raise ValueError(f"{kind} 未确认推送成功")
