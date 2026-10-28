import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { AssignmentResult } from '../types'
import { Pagination, PAGE_SIZE } from './Pagination'

export function AssignmentAttemptHistory({
  result,
  learner = false,
}: {
  result: AssignmentResult
  learner?: boolean
}) {
  const [page, setPage] = useState(1)
  const history = (result.history || []).filter((attempt) => attempt.completedAt).reverse()
  const currentPage = Math.min(page, Math.max(1, Math.ceil(history.length / PAGE_SIZE)))
  if (!history.length) return null
  return (
    <details className="assignment-history">
      <summary>Lịch sử {history.length} lượt đã nộp</summary>
      <p>Điểm chính thức là điểm cao nhất nộp đúng hạn. Làm lại không làm mất trạng thái Đạt.</p>
      {result.firstPassedAt && (
        <p>Đạt lần đầu: {new Date(result.firstPassedAt).toLocaleString('vi-VN')}</p>
      )}
      <ol start={(currentPage - 1) * PAGE_SIZE + 1}>
        {history.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map((attempt) => (
          <li key={attempt.attemptId}>
            {learner && attempt.completedAt ? (
              <Link to={`/attempts/${attempt.attemptId}/result`}>Lượt #{attempt.attemptId}</Link>
            ) : (
              <strong>Lượt #{attempt.attemptId}</strong>
            )}
            {' · '}
            {attempt.completedAt
              ? `${attempt.correctCount}/${attempt.totalQuestions} câu đúng`
              : 'Chưa nộp'}
            {attempt.completedAt && (
              <>
                {' '}
                · {new Date(attempt.completedAt).toLocaleString('vi-VN')} ·{' '}
                {attempt.eligible
                  ? attempt.passed
                    ? 'Đạt'
                    : 'Chưa đạt'
                  : 'Không tính điểm chính thức'}
              </>
            )}
          </li>
        ))}
      </ol>
      <Pagination total={history.length} page={currentPage} onPageChange={setPage} />
    </details>
  )
}
