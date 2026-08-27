import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createSurvey, fetchSurveyResult, fetchSurveys } from '../../api/surveys'
import type {
  Survey,
  SurveyQuestionType,
  SurveyQuestionWriteRequest,
  SurveyWriteRequest,
} from '../../api/types'
import { PageHeader } from '../../components/PageHeader'
import { StatusBlock, messageOf } from '../../components/StatusBlock'
import { QUESTION_TYPES, QUESTION_TYPE_LABEL } from '../../utils/labels'
import {
  formatCount,
  formatDateTime,
  isoToLocalInput,
  localInputToIso,
  NO_VALUE,
} from '../../utils/format'

interface QuestionDraft {
  text: string
  type: SurveyQuestionType
  required: boolean
  options: string[]
}

const EMPTY_QUESTION: QuestionDraft = {
  text: '',
  type: 'SINGLE_CHOICE',
  required: true,
  options: ['', ''],
}

/** 선택지가 필요한 유형인지. TEXT는 선택지를 보내지 않는다. */
function needsOptions(type: SurveyQuestionType): boolean {
  return type === 'SINGLE_CHOICE' || type === 'MULTIPLE_CHOICE'
}

function SurveyBuilder({
  submitting,
  errorMessage,
  onSubmit,
  onCancel,
}: {
  submitting: boolean
  errorMessage: string | null
  onSubmit: (body: SurveyWriteRequest) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [questions, setQuestions] = useState<QuestionDraft[]>([{ ...EMPTY_QUESTION }])
  const [localError, setLocalError] = useState<string | null>(null)

  function update(index: number, patch: Partial<QuestionDraft>) {
    setQuestions((current) =>
      current.map((question, position) =>
        position === index ? { ...question, ...patch } : question,
      ),
    )
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (submitting) return

    if (new Date(startsAt).getTime() >= new Date(endsAt).getTime()) {
      setLocalError('종료 시각이 시작 시각보다 뒤여야 합니다.')
      return
    }

    const built: SurveyQuestionWriteRequest[] = []
    for (const question of questions) {
      if (question.text.trim() === '') {
        setLocalError('문항 내용을 입력해 주세요.')
        return
      }
      if (needsOptions(question.type)) {
        const options = question.options.map((option) => option.trim()).filter(Boolean)
        if (options.length < 2) {
          setLocalError('선택형 문항은 선택지가 두 개 이상이어야 합니다.')
          return
        }
        built.push({
          text: question.text.trim(),
          type: question.type,
          required: question.required,
          options,
        })
        continue
      }
      // id는 보내지 않는다. 클라이언트가 DB 키를 정하면 다른 설문의 문항을
      // 덮어쓸 수 있다.
      built.push({
        text: question.text.trim(),
        type: question.type,
        required: question.required,
      })
    }

    setLocalError(null)
    onSubmit({
      title: title.trim(),
      description: description.trim(),
      startsAt: localInputToIso(startsAt),
      endsAt: localInputToIso(endsAt),
      questions: built,
    })
  }

  return (
    <form className="stack-form" onSubmit={submit}>
      <label className="field">
        <span className="field-label">제목</span>
        <input value={title} onChange={(event) => setTitle(event.target.value)} required />
      </label>

      <label className="field">
        <span className="field-label">설명</span>
        <textarea
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>

      <div className="form-row">
        <label className="field">
          <span className="field-label">시작 시각</span>
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)}
            required
          />
        </label>
        <label className="field">
          <span className="field-label">종료 시각</span>
          <input
            type="datetime-local"
            value={endsAt}
            onChange={(event) => setEndsAt(event.target.value)}
            required
          />
        </label>
      </div>

      <h2 className="section-title">문항</h2>
      {questions.map((question, index) => (
        <fieldset className="question-card" key={index}>
          <legend>문항 {index + 1}</legend>

          <label className="field">
            <span className="field-label">내용</span>
            <input
              value={question.text}
              onChange={(event) => update(index, { text: event.target.value })}
              required
            />
          </label>

          <div className="form-row">
            <label className="field">
              <span className="field-label">유형</span>
              <select
                value={question.type}
                onChange={(event) =>
                  update(index, { type: event.target.value as SurveyQuestionType })
                }
              >
                {QUESTION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {QUESTION_TYPE_LABEL[type]}
                  </option>
                ))}
              </select>
            </label>

            <label className="checkbox">
              <input
                type="checkbox"
                checked={question.required}
                onChange={(event) => update(index, { required: event.target.checked })}
              />
              <span>필수 응답</span>
            </label>
          </div>

          {needsOptions(question.type) ? (
            <div className="field">
              <span className="field-label">선택지</span>
              {question.options.map((option, optionIndex) => (
                <div className="item-row" key={optionIndex}>
                  <input
                    aria-label={`문항 ${index + 1} 선택지 ${optionIndex + 1}`}
                    value={option}
                    onChange={(event) =>
                      update(index, {
                        options: question.options.map((value, position) =>
                          position === optionIndex ? event.target.value : value,
                        ),
                      })
                    }
                  />
                </div>
              ))}
              <button
                type="button"
                className="button"
                onClick={() => update(index, { options: [...question.options, ''] })}
              >
                선택지 추가
              </button>
            </div>
          ) : null}

          <button
            type="button"
            className="button"
            onClick={() =>
              setQuestions((current) =>
                current.length === 1
                  ? [{ ...EMPTY_QUESTION }]
                  : current.filter((_, position) => position !== index),
              )
            }
          >
            문항 삭제
          </button>
        </fieldset>
      ))}

      <button
        type="button"
        className="button"
        onClick={() => setQuestions((current) => [...current, { ...EMPTY_QUESTION }])}
      >
        문항 추가
      </button>

      {localError || errorMessage ? (
        <p className="status status-error" role="alert">
          {localError ?? errorMessage}
        </p>
      ) : null}

      <div className="form-actions">
        <button type="button" className="button" onClick={onCancel}>
          취소
        </button>
        <button type="submit" className="button button-primary" disabled={submitting}>
          {submitting ? '저장 중…' : '설문 등록'}
        </button>
      </div>
    </form>
  )
}

function SurveyResults({ survey }: { survey: Survey }) {
  const result = useQuery({
    queryKey: ['admin', 'survey', survey.id, 'results'],
    queryFn: () => fetchSurveyResult(survey.id),
  })

  return (
    <StatusBlock isLoading={result.isPending} error={result.error} data={result.data}>
      {(data) => (
        <div className="results">
          <p className="metric-sub">응답한 사람 {formatCount(data.responseCount, '명')}</p>
          {data.questionResults.map((entry) => {
            // 응답에 유형이 함께 오지 않는다. 문항 정의와 맞춰 읽는다.
            const question = survey.questions.find((item) => item.id === entry.questionId)
            const summary = entry.summary

            return (
              <section className="result-card" key={entry.questionId}>
                <h3 className="result-title">
                  {question?.text ?? `문항 ${entry.questionId}`}
                  {question ? (
                    <span className="result-type"> · {QUESTION_TYPE_LABEL[question.type]}</span>
                  ) : null}
                </h3>

                {summary.optionCounts ? (
                  <ul className="result-list">
                    {Object.entries(summary.optionCounts).map(([option, count]) => (
                      <li key={option}>
                        {option} — {formatCount(count, '명')}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {summary.distribution ? (
                  <>
                    <p className="metric-sub">
                      평균 {summary.average === null || summary.average === undefined
                        ? NO_VALUE
                        : summary.average.toFixed(2)}
                    </p>
                    <ul className="result-list">
                      {Object.entries(summary.distribution).map(([score, count]) => (
                        <li key={score}>
                          {score}점 — {formatCount(count, '명')}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}

                {summary.responses ? (
                  <ul className="result-list">
                    {/* 누가 썼는지는 응답에 없다. 그게 정상이다. */}
                    {summary.responses.map((response, index) => (
                      <li key={index}>{response}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
            )
          })}
        </div>
      )}
    </StatusBlock>
  )
}

export function SurveysPage() {
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [openResult, setOpenResult] = useState<Survey | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const surveys = useQuery({ queryKey: ['admin', 'surveys'], queryFn: fetchSurveys })

  const create = useMutation({
    mutationFn: (body: SurveyWriteRequest) => createSurvey(body),
    onSuccess: () => {
      setCreating(false)
      setFormError(null)
      void queryClient.invalidateQueries({ queryKey: ['admin', 'surveys'] })
    },
    onError: (error) => setFormError(messageOf(error)),
  })

  if (creating) {
    return (
      <>
        <PageHeader title="설문 등록" />
        <SurveyBuilder
          submitting={create.isPending}
          errorMessage={formError}
          onSubmit={(body) => create.mutate(body)}
          onCancel={() => {
            setCreating(false)
            setFormError(null)
          }}
        />
      </>
    )
  }

  if (openResult) {
    return (
      <>
        <PageHeader
          title={`${openResult.title} 결과`}
          actions={
            <button type="button" className="button" onClick={() => setOpenResult(null)}>
              목록으로
            </button>
          }
        />
        <SurveyResults survey={openResult} />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="만족도 조사"
        description="설문은 등록과 결과 조회만 지원합니다. 수정과 삭제 API는 없습니다."
        actions={
          <button
            type="button"
            className="button button-primary"
            onClick={() => {
              setFormError(null)
              setCreating(true)
            }}
          >
            설문 등록
          </button>
        }
      />

      <StatusBlock
        isLoading={surveys.isPending}
        error={surveys.error}
        data={surveys.data}
        isEmpty={(rows) => rows.length === 0}
        emptyMessage="등록된 설문이 없습니다."
      >
        {(rows) => (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">제목</th>
                  <th scope="col">기간</th>
                  <th scope="col">문항 수</th>
                  <th scope="col">작업</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((survey) => (
                  <tr key={survey.id}>
                    <td>{survey.title}</td>
                    <td>
                      {formatDateTime(survey.startsAt)} ~ {formatDateTime(survey.endsAt)}
                    </td>
                    <td>{formatCount(survey.questions.length, '개')}</td>
                    <td className="table-actions">
                      <button
                        type="button"
                        className="button"
                        onClick={() => setOpenResult(survey)}
                      >
                        결과 보기
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </StatusBlock>
    </>
  )
}

export { isoToLocalInput }
