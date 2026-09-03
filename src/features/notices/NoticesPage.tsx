import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { createNotice, deleteNotice, fetchNotices, updateNotice } from '../../api/notices'
import type { Notice, NoticeWriteRequest } from '../../api/types'
import { StatusBlock, messageOf } from '../../components/StatusBlock'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { formatDateTime } from '../../utils/format'

type Editing = { mode: 'create' } | { mode: 'edit'; notice: Notice } | null

/** Figma 목록이 한 화면에 열 줄을 둔다. 서버는 페이지를 나눠 주지 않는다. */
const PAGE_SIZE = 10

/**
 * 공지 등록·수정 폼.
 *
 * 화면 구성은 Figma 관리자 웹(147:6723 등록 / 147:7102 수정)을 따른다.
 *
 * Figma와 다르게 둔 것과 그 이유:
 *
 * - "게시일시 예약"을 두지 않았다. 서버에 예약 발행 상태도 API도 없다.
 *   화면에만 만들면 시각을 골라 두고 그때 나가는 줄 알게 된다.
 * - "임시 저장"을 두지 않았다. 같은 이유로 저장할 곳이 없다.
 * - 내용은 서식 도구모음 없는 여러 줄 입력이다. 서버가 content를 그냥
 *   문자열로 저장하고 사용자 앱도 글자 그대로 보여 준다. 굵게·기울임을
 *   만들어도 앱에서는 태그가 그대로 읽힌다.
 * - publishedAt은 입력하지 않는다. 최초 공개 시각은 서버가 정한다.
 */
function NoticeForm({
  initial,
  submitting,
  errorMessage,
  onSubmit,
  onCancel,
  onDelete,
}: {
  initial?: Notice
  submitting: boolean
  errorMessage: string | null
  onSubmit: (body: NoticeWriteRequest) => void
  onCancel: () => void
  onDelete?: () => void
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [content, setContent] = useState(initial?.content ?? '')
  const [important, setImportant] = useState(initial?.important ?? false)
  const [published, setPublished] = useState(initial?.published ?? true)

  function submit(event: FormEvent) {
    event.preventDefault()
    if (submitting) return
    // publishedAt은 보내지 않는다. 최초 공개 시각은 서버가 정하고, 공개를
    // 껐다 켜도 바뀌지 않는다.
    onSubmit({ title: title.trim(), content: content.trim(), important, published })
  }

  return (
    <form className="figma-form" onSubmit={submit}>
      <h1 className="form-page-title">{initial ? '공지사항 수정' : '신규 공지사항 등록'}</h1>

      <div className="form-grid">
        <section className="content-card">
          <h2 className="form-section-title">공지사항 정보</h2>

          <div className="form-fields">
            <div className="form-cols" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              <label className="field">
                <span className="field-label">중요 공지 여부</span>
                <select
                  value={important ? 'important' : 'normal'}
                  onChange={(event) => setImportant(event.target.value === 'important')}
                >
                  <option value="normal">일반</option>
                  <option value="important">중요</option>
                </select>
              </label>

              <label className="field">
                <span className="field-label">노출 여부</span>
                <select
                  value={published ? 'shown' : 'hidden'}
                  onChange={(event) => setPublished(event.target.value === 'shown')}
                >
                  <option value="shown">노출</option>
                  <option value="hidden">숨김</option>
                </select>
              </label>
            </div>

            <label className="field">
              <span className="field-label">공지사항 제목</span>
              <input
                value={title}
                placeholder="제목 입력"
                onChange={(event) => setTitle(event.target.value)}
                required
              />
            </label>
          </div>
        </section>

        <section className="content-card">
          <h2 className="form-section-title">공지사항 내용</h2>
          <label className="field">
            <span className="sr-only">공지사항 내용</span>
            <textarea
              style={{ minHeight: '376px' }}
              value={content}
              placeholder="공지사항 내용 입력"
              onChange={(event) => setContent(event.target.value)}
              required
            />
          </label>
        </section>
      </div>

      {errorMessage ? (
        <p className="status status-error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <div className="form-actions-row">
        <button type="button" className="button-quiet" onClick={onCancel}>
          뒤로
        </button>
        {onDelete ? (
          <button type="button" className="button-outline-danger" onClick={onDelete}>
            삭제
          </button>
        ) : null}
        <button type="submit" className="button-dark" disabled={submitting}>
          {submitting ? '저장 중…' : initial ? '수정' : '등록'}
        </button>
      </div>
    </form>
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

export function NoticesPage() {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Editing>(null)
  const [pendingDelete, setPendingDelete] = useState<Notice | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  const notices = useQuery({ queryKey: ['admin', 'notices'], queryFn: fetchNotices })

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'notices'] })
  }

  const save = useMutation({
    mutationFn: (body: NoticeWriteRequest) =>
      editing?.mode === 'edit' ? updateNotice(editing.notice.id, body) : createNotice(body),
    onSuccess: () => {
      setEditing(null)
      setFormError(null)
      invalidate()
    },
    onError: (error) => setFormError(messageOf(error)),
  })

  /**
   * 노출 전환.
   *
   * 서버의 수정은 전체 교체다. published만 바꾸고 나머지는 지금 값을 그대로
   * 다시 보낸다. 빠뜨리면 제목이나 내용이 지워진다.
   */
  const toggle = useMutation({
    mutationFn: (notice: Notice) =>
      updateNotice(notice.id, {
        title: notice.title,
        content: notice.content,
        important: notice.important,
        published: !notice.published,
      }),
    onSuccess: () => {
      setListError(null)
      invalidate()
    },
    onError: (error) => setListError(messageOf(error)),
  })

  const remove = useMutation({
    mutationFn: (noticeId: number) => deleteNotice(noticeId),
    onSuccess: () => {
      setPendingDelete(null)
      setListError(null)
      setEditing(null)
      invalidate()
    },
    onError: (error) => {
      setPendingDelete(null)
      setListError(messageOf(error))
    },
  })

  const rows = notices.data
  const pageCount = rows ? Math.max(1, Math.ceil(rows.length / PAGE_SIZE)) : 1
  const visible = useMemo(
    () => (rows ? rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) : []),
    [rows, page],
  )

  useEffect(() => {
    if (page > pageCount) setPage(1)
  }, [page, pageCount])

  const deleteDialog = (
    <ConfirmDialog
      open={pendingDelete !== null}
      title="공지를 삭제할까요?"
      description={pendingDelete ? `${pendingDelete.title} 을(를) 삭제합니다.` : undefined}
      onCancel={() => setPendingDelete(null)}
      onConfirm={() => {
        if (pendingDelete) remove.mutate(pendingDelete.id)
      }}
    />
  )

  if (editing) {
    const initial = editing.mode === 'edit' ? editing.notice : undefined
    return (
      <>
        <NoticeForm
          key={initial?.id ?? 'new'}
          initial={initial}
          submitting={save.isPending}
          errorMessage={formError}
          onSubmit={(body) => save.mutate(body)}
          onCancel={() => {
            setEditing(null)
            setFormError(null)
          }}
          onDelete={initial ? () => setPendingDelete(initial) : undefined}
        />
        {deleteDialog}
      </>
    )
  }

  return (
    <section className="content-card">
      <div className="content-card-head">
        <h1 className="content-card-title">공지사항 목록</h1>
        <div className="content-card-actions">
          <button
            type="button"
            className="button-dark"
            onClick={() => {
              setFormError(null)
              setEditing({ mode: 'create' })
            }}
          >
            공지사항 등록
          </button>
        </div>
      </div>

      {listError ? (
        <p className="status status-error" role="alert">
          {listError}
        </p>
      ) : null}

      <StatusBlock
        isLoading={notices.isPending}
        error={notices.error}
        data={notices.data}
        isEmpty={(list) => list.length === 0}
        emptyMessage="등록된 공지가 없습니다."
      >
        {() => (
          <>
            <div className="list-scroll">
              <table className="list-table">
                <caption className="sr-only">
                  공지사항 목록입니다. 숨긴 공지도 여기에는 보이며 사용자 화면에는 노출된 것만
                  나갑니다.
                </caption>
                <colgroup>
                  <col style={{ width: '5.6%' }} />
                  <col style={{ width: '24.6%' }} />
                  <col style={{ width: '20.7%' }} />
                  <col style={{ width: '7.8%' }} />
                  <col style={{ width: '20.7%' }} />
                  <col style={{ width: '20.6%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">번호</th>
                    <th scope="col">제목</th>
                    <th scope="col">게시일시</th>
                    <th scope="col">중요</th>
                    <th scope="col">노출 상태</th>
                    <th scope="col">
                      <span className="sr-only">작업</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((notice, index) => (
                    <tr key={notice.id}>
                      <td>{(page - 1) * PAGE_SIZE + index + 1}</td>
                      <td>{notice.title}</td>
                      <td>{formatDateTime(notice.publishedAt)}</td>
                      <td className={notice.important ? 'list-status-past' : undefined}>
                        {notice.important ? '중요' : '일반'}
                      </td>
                      <td
                        className={notice.published ? 'list-status-today' : 'list-status-upcoming'}
                      >
                        {notice.published ? '노출' : '숨김'}
                      </td>
                      <td>
                        <div className="list-actions">
                          <button
                            type="button"
                            className="row-button"
                            onClick={() => {
                              setFormError(null)
                              setEditing({ mode: 'edit', notice })
                            }}
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            className="row-button row-button-quiet"
                            disabled={toggle.isPending}
                            onClick={() => toggle.mutate(notice)}
                          >
                            {notice.published ? '숨기기' : '숨김 해제'}
                          </button>
                          <button
                            type="button"
                            className="row-button row-button-outline"
                            onClick={() => setPendingDelete(notice)}
                          >
                            삭제
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

      {deleteDialog}
    </section>
  )
}
