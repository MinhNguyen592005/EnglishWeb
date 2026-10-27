import './Pagination.css'

export const PAGE_SIZE = 10

export function Pagination({ total, page, onPageChange }: { total: number; page: number; onPageChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const current = Math.max(1, Math.min(page, pages))
  return <nav className="list-pagination" aria-label="Phân trang">
    <div>
      <button type="button" className="button secondary" disabled={current === 1} onClick={() => onPageChange(current - 1)}>Trước</button>
      <strong aria-live="polite">Trang {current} / {pages}</strong>
      <button type="button" className="button secondary" disabled={current === pages} onClick={() => onPageChange(current + 1)}>Sau</button>
    </div>
  </nav>
}
