import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createNotice, deleteNotice, fetchNotices, updateNotice } from '../../api/notices'
import type { Notice, NoticeWriteRequest } from '../../api/types'
import { PageHeader } from '../../components/PageHeader'
import { StatusBlock, messageOf } from '../../components/StatusBlock'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { formatDateTime } from '../../utils/format'

type Editing = { mode: 'create' } | { mode: 'edit'; notice: Notice } | null

function NoticeForm({
  initial,
  submitting,
  errorMessage,
  onSubmit,
  onCancel,
}: {
  initial?: Notice
  submitting: boolean
  errorMessage: string | null
  onSubmit: (body: NoticeWriteRequest) => void
  onCancel: () => void
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
    <form className="stack-form" onSubmit={submit}>
      <label className="field">
        <span className="field-label">제목</span>
        <input value={title} onChange={(event) => setTitle(event.target.value)} required />
      </label>

      <label className="field">
        <span className="field-label">내용</span>
        <textarea
          rows={8}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          required
        />
      </label>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={important}
          onChange={(event) => setImportant(event.target.checked)}
        />
        <span>중요 공지</span>
      </label>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={published}
          onChange={(event) => setPublished(event.target.checked)}
        />
        <span>공개</span>
      </label>

      {errorMessage ? (
        <p className="status status-error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <div className="form-actions">
        <button type="button" className="button" onClick={onCancel}>
          취소
        </button>
        <button type="submit" className="button button-primary" disabled={submitting}>
          {submitting ? '저장 중…' : '저장'}
        </button>
      </div>
    </form>
  )
}

export function NoticesPage() {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Editing>(null)
  const [pendingDelete, setPendingDelete] = useState<Notice | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)

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

  const remove = useMutation({
    mutationFn: (noticeId: number) => deleteNotice(noticeId),
    onSuccess: () => {
      setPendingDelete(null)
      setListError(null)
      invalidate()
    },
    onError: (error) => {
      setPendingDelete(null)
      setListError(messageOf(error))
    },
  })

  if (editing) {
    return (
      <>
        <PageHeader title={editing.mode === 'edit' ? '공지 수정' : '공지 등록'} />
        <NoticeForm
          key={editing.mode === 'edit' ? editing.notice.id : 'new'}
          initial={editing.mode === 'edit' ? editing.notice : undefined}
          submitting={save.isPending}
          errorMessage={formError}
          onSubmit={(body) => save.mutate(body)}
          onCancel={() => {
            setEditing(null)
            setFormError(null)
          }}
        />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="공지 관리"
        description="공개하지 않은 공지도 여기에는 보입니다. 사용자 화면에는 공개된 것만 나갑니다."
        actions={
          <button
            type="button"
            className="button button-primary"
            onClick={() => {
              setFormError(null)
              setEditing({ mode: 'create' })
            }}
          >
            공지 등록
          </button>
        }
      />

      {listError ? (
        <p className="status status-error" role="alert">
          {listError}
        </p>
      ) : null}

      <StatusBlock
        isLoading={notices.isPending}
        error={notices.error}
        data={notices.data}
        isEmpty={(rows) => rows.length === 0}
        emptyMessage="등록된 공지가 없습니다."
      >
        {(rows) => (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">제목</th>
                  <th scope="col">중요</th>
                  <th scope="col">공개</th>
                  <th scope="col">공개 시각</th>
                  <th scope="col">작업</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((notice) => (
                  <tr key={notice.id}>
                    <td>{notice.title}</td>
                    <td>{notice.important ? '중요' : '—'}</td>
                    <td>
                      <span className={notice.published ? 'badge badge-on' : 'badge badge-off'}>
                        {notice.published ? '공개' : '비공개'}
                      </span>
                    </td>
                    <td>{formatDateTime(notice.publishedAt)}</td>
                    <td className="table-actions">
                      <button
                        type="button"
                        className="button"
                        onClick={() => {
                          setFormError(null)
                          setEditing({ mode: 'edit', notice })
                        }}
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        className="button button-danger"
                        onClick={() => setPendingDelete(notice)}
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </StatusBlock>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="공지를 삭제할까요?"
        description={pendingDelete ? `${pendingDelete.title} 을(를) 삭제합니다.` : undefined}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) remove.mutate(pendingDelete.id)
        }}
      />
    </>
  )
}
