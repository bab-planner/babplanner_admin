import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { fetchInquiries, updateInquiry } from '../../api/inquiries'
import type { Inquiry, InquiryStatus } from '../../api/types'
import { StatusBlock, messageOf } from '../../components/StatusBlock'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import {
  INQUIRY_CATEGORY_LABEL,
  INQUIRY_STATUSES,
  INQUIRY_STATUS_LABEL,
} from '../../utils/labels'
import { formatDateTime } from '../../utils/format'

interface InquiryPatch {
  status?: InquiryStatus
  adminAnswer?: string | null
}

/** Figma 목록이 한 화면에 열 줄을 둔다. 서버는 페이지를 나눠 주지 않는다. */
const PAGE_SIZE = 10

/**
 * 문의/건의 조회.
 *
 * 위쪽 기본 정보와 내용은 Figma 관리자 웹(147:7211)을 그대로 따른다.
 *
 * 답변 관리는 Figma에 없다. 그런데 서버에 PATCH /admin/inquiries/{id} 가 있고
 * 이미 동작하는 기능이다. 화면에서 빼면 관리자가 답변을 달 방법이 없어진다.
 * 그래서 지우지 않고, 같은 카드·간격·타이포로 아래에 한 장 더 붙였다.
 */
function InquiryDetail({ inquiry, onClose }: { inquiry: Inquiry; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<InquiryStatus>(inquiry.status)
  const [answer, setAnswer] = useState(inquiry.adminAnswer ?? '')
  const [error, setError] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  useEffect(() => {
    setStatus(inquiry.status)
    setAnswer(inquiry.adminAnswer ?? '')
  }, [inquiry])

  const save = useMutation({
    mutationFn: (patch: InquiryPatch) => updateInquiry(inquiry.id, patch),
    onSuccess: () => {
      setError(null)
      setConfirmClear(false)
      void queryClient.invalidateQueries({ queryKey: ['admin', 'inquiries'] })
    },
    onError: (caught) => {
      setConfirmClear(false)
      setError(messageOf(caught))
    },
  })

  const statusChanged = status !== inquiry.status
  const answerChanged = answer.trim() !== (inquiry.adminAnswer ?? '')
  const nothingToSave = !statusChanged && !answerChanged

  function submit() {
    // 아무것도 바뀌지 않았으면 보내지 않는다. 빈 PATCH는 서버가 422로
    // 거절한다.
    if (nothingToSave) {
      setError('변경한 내용이 없습니다.')
      return
    }

    const patch: InquiryPatch = {}
    if (statusChanged) patch.status = status
    // 답변만 바꿨으면 상태는 보내지 않는다. 답변을 썼다고 상태를 자동으로
    // ANSWERED로 바꾸지 않는다. 상태는 관리자가 명시적으로 정한다.
    if (answerChanged) patch.adminAnswer = answer.trim()
    save.mutate(patch)
  }

  return (
    <div className="figma-form">
      <h1 className="form-page-title">문의/건의 조회</h1>

      <div className="form-grid">
        <section className="content-card">
          <h2 className="form-section-title">문의/건의 정보</h2>

          <div className="form-fields">
            <div className="form-cols" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              <p className="field">
                <span className="field-label">문의/건의 유형</span>
                <span className="field-readonly-value">
                  {INQUIRY_CATEGORY_LABEL[inquiry.category]}
                </span>
              </p>

              <p className="field">
                <span className="field-label">접수일시</span>
                <span className="field-readonly-value">{formatDateTime(inquiry.createdAt)}</span>
              </p>
            </div>

            <p className="field">
              <span className="field-label">제목</span>
              <span className="field-readonly-value">{inquiry.title}</span>
            </p>
          </div>
        </section>

        <section className="content-card">
          <h2 className="form-section-title">문의/건의 내용</h2>
          <p className="readonly-block">{inquiry.content}</p>
        </section>

        {/*
          Figma에 없는 카드다. 서버에 답변 기능이 있고 이미 쓰이고 있어
          지우지 않았다. 위 카드들과 같은 모양을 쓴다.
        */}
        <section className="content-card">
          <h2 className="form-section-title">답변 관리</h2>

          <div className="form-fields">
            <label className="field">
              <span className="field-label">처리 상태</span>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as InquiryStatus)}
              >
                {INQUIRY_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {INQUIRY_STATUS_LABEL[value]}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-label">답변</span>
              <textarea
                style={{ minHeight: '176px' }}
                value={answer}
                placeholder="답변 입력"
                onChange={(event) => setAnswer(event.target.value)}
              />
            </label>

            <p className="field">
              <span className="field-label">답변 일시</span>
              <span className="field-readonly-value">{formatDateTime(inquiry.answeredAt)}</span>
            </p>
          </div>

          {error ? (
            <p className="status status-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="form-actions-row">
            {inquiry.adminAnswer ? (
              <button
                type="button"
                className="button-outline-danger"
                onClick={() => setConfirmClear(true)}
              >
                답변 삭제
              </button>
            ) : null}
            <button
              type="button"
              className="button-dark"
              disabled={save.isPending}
              onClick={submit}
            >
              {save.isPending ? '저장 중…' : '답변 저장'}
            </button>
          </div>
        </section>
      </div>

      <div className="form-actions-row">
        <button type="button" className="button-quiet" onClick={onClose}>
          뒤로
        </button>
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="답변을 삭제할까요?"
        description="저장된 답변이 지워집니다. 상태는 그대로 둡니다."
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          // null을 명시해야 서버가 "지워 달라"로 읽는다. 필드를 빼면 그대로
          // 남는다. 상태는 보내지 않아 유지된다.
          save.mutate({ adminAnswer: null })
        }}
      />
    </div>
  )
}

function Pagination({
  page,
  pageCount,
  onChange,
}: {
  page: number
  pageCount: number
  onChange: (next: number) => void
}) {
  if (pageCount <= 1) return null
  const pages = Array.from({ length: pageCount }, (_, index) => index + 1)

  return (
    <nav className="pagination" aria-label="목록 페이지">
      <button type="button" onClick={() => onChange(page - 1)} disabled={page === 1} aria-label="이전 페이지">
        <ChevronLeft size={16} aria-hidden="true" />
      </button>
      {pages.map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          aria-current={value === page ? 'page' : undefined}
          aria-label={`${value} 페이지`}
        >
          {value}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page === pageCount}
        aria-label="다음 페이지"
      >
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </nav>
  )
}

export function InquiriesPage() {
  const [statusFilter, setStatusFilter] = useState<InquiryStatus | ''>('')
  const [openId, setOpenId] = useState<number | null>(null)
  const [page, setPage] = useState(1)

  const inquiries = useQuery({
    queryKey: ['admin', 'inquiries', statusFilter],
    queryFn: () => fetchInquiries(statusFilter),
  })

  useEffect(() => {
    setPage(1)
  }, [statusFilter])

  const open = inquiries.data?.find((inquiry) => inquiry.id === openId) ?? null

  const rows = inquiries.data
  const pageCount = rows ? Math.max(1, Math.ceil(rows.length / PAGE_SIZE)) : 1
  const visible = useMemo(
    () => (rows ? rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) : []),
    [rows, page],
  )

  if (open) {
    return <InquiryDetail inquiry={open} onClose={() => setOpenId(null)} />
  }

  return (
    <section className="content-card">
      <div className="content-card-head">
        <h1 className="content-card-title">문의/건의 목록</h1>

        <div className="content-card-actions">
          {/*
            Figma 목록에는 조회 조건이 없다. 답변하지 않은 문의를 골라 보는
            일이 이 화면의 주 용도라 남긴다.
          */}
          <label className="field field-inline">
            <span className="field-label">처리 상태</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as InquiryStatus | '')}
            >
              <option value="">전체</option>
              {INQUIRY_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {INQUIRY_STATUS_LABEL[value]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <StatusBlock
        isLoading={inquiries.isPending}
        error={inquiries.error}
        data={inquiries.data}
        isEmpty={(list) => list.length === 0}
        emptyMessage="해당 조건의 문의가 없습니다."
      >
        {() => (
          <>
            <div className="list-scroll">
              <table className="list-table">
                <colgroup>
                  <col style={{ width: '5.6%' }} />
                  <col style={{ width: '14.5%' }} />
                  <col style={{ width: '47.1%' }} />
                  <col style={{ width: '12.8%' }} />
                  <col style={{ width: '11.9%' }} />
                  <col style={{ width: '8.1%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">번호</th>
                    <th scope="col">문의 유형</th>
                    <th scope="col">제목</th>
                    <th scope="col">접수일시</th>
                    <th scope="col">처리 상태</th>
                    <th scope="col">
                      <span className="sr-only">작업</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {/* 서버 정렬을 그대로 쓴다. */}
                  {visible.map((inquiry, index) => (
                    <tr key={inquiry.id}>
                      <td>{(page - 1) * PAGE_SIZE + index + 1}</td>
                      <td>{INQUIRY_CATEGORY_LABEL[inquiry.category]}</td>
                      <td>{inquiry.title}</td>
                      <td>{formatDateTime(inquiry.createdAt)}</td>
                      <td
                        className={
                          inquiry.status === 'ANSWERED' || inquiry.status === 'CLOSED'
                            ? 'list-status-upcoming'
                            : 'list-status-today'
                        }
                      >
                        {INQUIRY_STATUS_LABEL[inquiry.status]}
                      </td>
                      <td>
                        <div className="list-actions">
                          <button
                            type="button"
                            className="row-button"
                            onClick={() => setOpenId(inquiry.id)}
                          >
                            조회
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination page={page} pageCount={pageCount} onChange={setPage} />
          </>
        )}
      </StatusBlock>
    </section>
  )
}
