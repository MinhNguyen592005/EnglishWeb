// Cùng origin với REST để trình duyệt gửi đúng cookie phiên đăng nhập qua proxy.
export function systemSocketUrl() {
  return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/ws-system`
}
