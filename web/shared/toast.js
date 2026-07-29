// 全局轻提示：设置页/工具页没有日志列表，错误与保存结果必须有统一的上屏出口。
const TOAST_TIMEOUT = { info: 3200, success: 2600, warning: 5200, error: 7000 };
const TOAST_MAX = 4;

function ensureToastHost() {
  let host = document.getElementById("toastHost");
  if (!host) {
    host = document.createElement("div");
    host.id = "toastHost";
    host.className = "toastHost";
    host.setAttribute("role", "status");
    host.setAttribute("aria-live", "polite");
    document.body.appendChild(host);
  }
  return host;
}

function showToast(message, level = "info", timeout = 0) {
  const text = String(message ?? "").trim();
  if (!text) return null;
  const host = ensureToastHost();
  const last = host.lastElementChild;
  if (last && last.dataset.text === text) {
    bumpToastRepeat(last);
    return last;
  }
  const toast = document.createElement("div");
  toast.className = `toast ${level}`;
  toast.dataset.text = text;
  toast.innerHTML = `<span class="toastText"></span><button class="toastClose" type="button" aria-label="关闭">×</button>`;
  toast.querySelector(".toastText").textContent = text;
  toast.querySelector(".toastClose").addEventListener("click", () => dismissToast(toast));
  host.appendChild(toast);
  while (host.children.length > TOAST_MAX) host.firstElementChild.remove();
  const delay = timeout || TOAST_TIMEOUT[level] || TOAST_TIMEOUT.info;
  toast.dataset.timer = String(setTimeout(() => dismissToast(toast), delay));
  return toast;
}

function bumpToastRepeat(toast) {
  const count = Number(toast.dataset.repeat || 1) + 1;
  toast.dataset.repeat = String(count);
  let badge = toast.querySelector(".toastRepeat");
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "toastRepeat";
    toast.insertBefore(badge, toast.querySelector(".toastClose"));
  }
  badge.textContent = `×${count}`;
}

function dismissToast(toast) {
  if (!toast || !toast.isConnected) return;
  clearTimeout(Number(toast.dataset.timer));
  toast.classList.add("leaving");
  setTimeout(() => toast.remove(), 160);
}

window.showToast = showToast;

// 剪贴板：navigator.clipboard 只在 https/localhost 可用，局域网 http 必须降级。
async function copyTextToClipboard(text) {
  const value = String(text ?? "");
  if (!value) return false;
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // 继续尝试 execCommand 降级
    }
  }
  return legacyCopy(value);
}

function legacyCopy(value) {
  try {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand && document.execCommand("copy");
    area.remove();
    return Boolean(ok);
  } catch {
    return false;
  }
}

function downloadTextFile(text, filename) {
  const blob = new Blob([String(text ?? "")], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || "export.txt";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

window.copyTextToClipboard = copyTextToClipboard;
window.downloadTextFile = downloadTextFile;
