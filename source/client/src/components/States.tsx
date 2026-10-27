import { AlertCircle, LoaderCircle } from 'lucide-react'
export function Loading() { return <div className="state-card" role="status"><LoaderCircle className="spin" size={28}/><p>Đang tải dữ liệu từ trạm...</p></div> }
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) { return <div className="state-card" role="alert"><AlertCircle size={28}/><strong>Chưa thể tải dữ liệu</strong><p>{message}</p>{retry && <button className="button secondary" onClick={retry}>Thử lại</button>}</div> }
