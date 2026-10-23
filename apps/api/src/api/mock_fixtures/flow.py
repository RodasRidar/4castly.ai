"""Session, conversations, entry flow (upload, digestion, confirmation, clarification) and errors."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from api.mock_fixtures._constants import (
    DATA_UNTIL,
    NOW,
    READY_CONVERSATION,
    RUN_KEY,
    SUPPORT_REF,
    TENANT_NAME,
    TODAY,
    XLSX,
    ago,
    uid,
)
from api.schemas import (
    ApiError,
    AssistantStyle,
    ClarificationAnswers,
    ClarificationOption,
    ClarificationPayload,
    ClarificationQuestion,
    ColumnMapping,
    Company,
    Conversation,
    ConversationDetail,
    ConversationGroup,
    ConversationPage,
    ConversationStage,
    DataSummary,
    DataWarning,
    DateColumnCandidate,
    DateMapping,
    FieldIssue,
    FileProfile,
    Job,
    JobAccepted,
    JobKind,
    JobStage,
    JobStageInfo,
    JobStatus,
    Locale,
    MovementRule,
    NormalizationPlan,
    PlanView,
    Preferences,
    QuantityMapping,
    TextMapping,
    Theme,
    UnitMapping,
    Upload,
    UploadCompleted,
    UploadTicket,
    User,
)
from api.schemas.enums import (
    ClarificationQuestionId,
    ColumnType,
    HadStockouts,
    MappedField,
    MovementTreatment,
    PlanAuthor,
    PlanStatus,
    SourceKind,
    StageState,
    UploadErrorCode,
    UploadStatus,
    WarningCode,
    WarningSeverity,
)
from api.schemas.uploads import ColumnProfile, SheetProfile

PRODUCTS_FOUND = 26
SHORT_HISTORY_PRODUCTS = 3
HISTORY_WEEKS = 40
ROWS_READ = 4812
ROWS_DROPPED = 3
SAMPLE_CODES = ["QF-0001", "QF-0002", "QF-0003"]
THIS_WEEK_DAYS = 6


def session() -> dict[str, object]:
    user = User(
        id=uid("user"),
        email="ana.torres@example.com",
        full_name="Ana Torres",
        job_title="Jefa de compras",
        company=Company(id=uid("tenant"), name=TENANT_NAME),
    )
    preferences = Preferences(
        theme=Theme.SYSTEM,
        locale=Locale.ES,
        time_zone="America/Lima",
        assistant_style=AssistantStyle.BRIEF,
    )
    return {
        "user": user.model_dump(mode="json"),
        "preferences": preferences.model_dump(mode="json"),
    }


def kardex_profile() -> FileProfile:
    return FileProfile(
        source_kind=SourceKind.KARDEX,
        sheets=[
            SheetProfile(
                name="Kardex",
                row_count=ROWS_READ,
                columns=[
                    ColumnProfile(
                        name="Fecha", inferred_type=ColumnType.DATE, samples=["12/01/2026"]
                    ),
                    ColumnProfile(
                        name="Tipo de movimiento", inferred_type=ColumnType.TEXT, samples=["01"]
                    ),
                    ColumnProfile(name="Salida", inferred_type=ColumnType.NUMBER, samples=["120"]),
                ],
            )
        ],
        date_from=date(2026, 1, 12),
        date_to=DATA_UNTIL,
    )


def tabular_profile() -> FileProfile:
    return FileProfile(
        source_kind=SourceKind.TABULAR,
        sheets=[
            SheetProfile(
                name="Ventas",
                row_count=ROWS_READ,
                columns=[
                    ColumnProfile(
                        name="Fecha Doc",
                        inferred_type=ColumnType.DATE,
                        samples=["12/01/2026", "13/01/2026"],
                    ),
                    ColumnProfile(
                        name="Cod Art", inferred_type=ColumnType.TEXT, samples=SAMPLE_CODES
                    ),
                    ColumnProfile(
                        name="Artículo",
                        inferred_type=ColumnType.TEXT,
                        samples=["Ácido cítrico anhidro", "Glicerina vegetal USP"],
                    ),
                    ColumnProfile(
                        name="Cant", inferred_type=ColumnType.NUMBER, samples=["1.850,5", "320"]
                    ),
                ],
            ),
            SheetProfile(name="Resumen", row_count=12, columns=[]),
        ],
        date_from=date(2026, 1, 12),
        date_to=DATA_UNTIL,
    )


@dataclass(frozen=True)
class _Conv:
    key: str
    title: str
    stage: ConversationStage
    file: str
    activity: timedelta
    pinned: bool = False


_CONVERSATIONS = (
    _Conv(
        READY_CONVERSATION,
        "Kardex octubre 2026",
        ConversationStage.READY,
        "kardex_oct.xlsx",
        timedelta(minutes=25),
        pinned=True,
    ),
    _Conv(
        "conv-ready-week",
        "Ventas tercer trimestre",
        ConversationStage.READY,
        "ventas_q3.xlsx",
        timedelta(days=2),
    ),
    _Conv(
        "conv-ready-old",
        "Kardex setiembre 2026",
        ConversationStage.READY,
        "kardex_set.xlsx",
        timedelta(days=12),
    ),
    _Conv(
        "conv-queued",
        "Pendiente de inicio",
        ConversationStage.QUEUED,
        "ventas_nuevo.xlsx",
        timedelta(minutes=2),
    ),
    _Conv(
        "conv-uploaded",
        "Archivo recién subido",
        ConversationStage.UPLOADED,
        "ventas_hoy.xlsx",
        timedelta(minutes=3),
    ),
    _Conv(
        "conv-digesting",
        "Ventas enero a octubre",
        ConversationStage.DIGESTING,
        "ventas_2026.xlsx",
        timedelta(minutes=6),
    ),
    _Conv(
        "conv-unreadable",
        "Inventario protegido",
        ConversationStage.UNREADABLE,
        "inventario_protegido.xlsx",
        timedelta(hours=1),
    ),
    _Conv(
        "conv-needs-date",
        "Reporte sin fechas",
        ConversationStage.NEEDS_DATE_COLUMN,
        "reporte_stock.csv",
        timedelta(hours=2),
    ),
    _Conv(
        "conv-awaiting",
        "Ventas por confirmar",
        ConversationStage.AWAITING_CONFIRMATION,
        "ventas_2026.xlsx",
        timedelta(hours=3),
    ),
    _Conv(
        "conv-confirmed",
        "Datos confirmados",
        ConversationStage.CONFIRMED,
        "ventas_2026.xlsx",
        timedelta(hours=4),
    ),
    _Conv(
        "conv-clarifying",
        "Aclaraciones pendientes",
        ConversationStage.CLARIFYING,
        "ventas_2026.xlsx",
        timedelta(hours=5),
    ),
    _Conv(
        "conv-calculating",
        "Calculando pronóstico",
        ConversationStage.CALCULATING,
        "ventas_2026.xlsx",
        timedelta(minutes=9),
    ),
    _Conv(
        "conv-failed",
        "Pronóstico con error",
        ConversationStage.FAILED,
        "ventas_2026.xlsx",
        timedelta(days=3),
    ),
    _Conv(
        "conv-cancelled",
        "Digestión cancelada",
        ConversationStage.CANCELLED,
        "ventas_vieja.xlsx",
        timedelta(days=20),
    ),
)

_JOB_STAGES = {ConversationStage.DIGESTING, ConversationStage.QUEUED, ConversationStage.UPLOADED}
_PROFILE_STAGES = {
    ConversationStage.NEEDS_DATE_COLUMN,
    ConversationStage.AWAITING_CONFIRMATION,
    ConversationStage.CONFIRMED,
    ConversationStage.CLARIFYING,
    ConversationStage.CALCULATING,
    ConversationStage.READY,
    ConversationStage.FAILED,
}


def _group(conv: _Conv) -> ConversationGroup:
    if conv.pinned:
        return ConversationGroup.PINNED
    when = NOW - conv.activity
    age = (TODAY - when.date()).days
    if age == 0:
        return ConversationGroup.TODAY
    return ConversationGroup.THIS_WEEK if age <= THIS_WEEK_DAYS else ConversationGroup.OLDER


def _upload(conv: _Conv) -> Upload:
    failed = conv.stage is ConversationStage.UNREADABLE
    has_profile = conv.stage in _PROFILE_STAGES
    pending = conv.stage is ConversationStage.QUEUED
    profile = tabular_profile() if has_profile else None
    return Upload(
        id=uid(f"upload-{conv.key}"),
        file_name=conv.file,
        size_bytes=482_113,
        content_type=XLSX,
        status=(
            UploadStatus.FAILED
            if failed
            else UploadStatus.PENDING
            if pending
            else UploadStatus.READABLE
            if has_profile
            else UploadStatus.UPLOADED
        ),
        error_code=UploadErrorCode.PASSWORD_PROTECTED if failed else None,
        sheets=[s.name for s in profile.sheets] if profile else [],
        selected_sheet="Ventas" if profile else None,
        profile=profile,
        uploaded_at=None if pending else NOW - conv.activity,
    )


def _conversation(conv: _Conv) -> ConversationDetail:
    active_job = conv.stage in _JOB_STAGES - {ConversationStage.UPLOADED} | {
        ConversationStage.CALCULATING
    }
    return ConversationDetail(
        id=uid(conv.key),
        title=conv.title,
        stage=conv.stage,
        group=_group(conv),
        pinned=conv.pinned,
        archived=False,
        file_name=conv.file,
        current_job_id=uid(f"job-{conv.key}") if active_job else None,
        current_run_id=uid(RUN_KEY) if conv.stage is ConversationStage.READY else None,
        created_at=NOW - conv.activity - timedelta(minutes=20),
        last_activity_at=NOW - conv.activity,
        deleted_at=None,
        upload=_upload(conv),
    )


def conversations() -> dict[str, object]:
    details = [_conversation(c) for c in _CONVERSATIONS]
    listed = [Conversation.model_validate(d.model_dump(exclude={"upload"})) for d in details]
    page = ConversationPage(items=listed, next_cursor=None)
    return {
        "page": page.model_dump(mode="json"),
        "details": [d.model_dump(mode="json") for d in details],
    }


def _job(
    key: str,
    kind: JobKind,
    status: JobStatus,
    stages: list[tuple[JobStage, StageState]],
    *,
    processed: int | None = None,
    total: int | None = None,
    error_ref: str | None = None,
) -> Job:
    active = next((s for s, state in stages if state is StageState.ACTIVE), None)
    return Job(
        id=uid(f"job-{key}"),
        kind=kind,
        status=status,
        conversation_id=uid("conv-digesting" if kind is JobKind.DIGEST else "conv-calculating"),
        stage=active,
        stages=[JobStageInfo(stage=s, state=state) for s, state in stages],
        processed=processed,
        total=total,
        cancel_requested=False,
        error_ref=error_ref,
        created_at=ago(minutes=8),
        finished_at=None if status in {JobStatus.QUEUED, JobStatus.RUNNING} else ago(minutes=2),
    )


def _digest_stages(*states: StageState) -> list[tuple[JobStage, StageState]]:
    stages = (JobStage.READING_FILE, JobStage.IDENTIFYING_COLUMNS, JobStage.READY)
    return list(zip(stages, states, strict=True))


def _forecast_stages(*states: StageState) -> list[tuple[JobStage, StageState]]:
    stages = (JobStage.CLEANING_DATA, JobStage.CALCULATING_FORECAST, JobStage.READY)
    return list(zip(stages, states, strict=True))


def jobs() -> dict[str, Job]:
    done, active, pending = StageState.DONE, StageState.ACTIVE, StageState.PENDING
    return {
        "digest_running": _job(
            "digest-running",
            JobKind.DIGEST,
            JobStatus.RUNNING,
            _digest_stages(done, active, pending),
        ),
        "digest_succeeded": _job(
            "digest-ok", JobKind.DIGEST, JobStatus.SUCCEEDED, _digest_stages(done, done, done)
        ),
        "digest_cancelled": _job(
            "digest-cancelled",
            JobKind.DIGEST,
            JobStatus.CANCELLED,
            _digest_stages(done, pending, pending),
        ),
        "digest_failed": _job(
            "digest-failed",
            JobKind.DIGEST,
            JobStatus.FAILED,
            _digest_stages(done, pending, pending),
            error_ref=SUPPORT_REF,
        ),
        "forecast_running": _job(
            "forecast-running",
            JobKind.FORECAST,
            JobStatus.RUNNING,
            _forecast_stages(done, active, pending),
            processed=14,
            total=26,
        ),
        "forecast_succeeded": _job(
            "forecast-ok", JobKind.FORECAST, JobStatus.SUCCEEDED, _forecast_stages(done, done, done)
        ),
        "forecast_failed": _job(
            "forecast-failed",
            JobKind.FORECAST,
            JobStatus.FAILED,
            _forecast_stages(done, pending, pending),
            error_ref=SUPPORT_REF,
        ),
    }


def _summary() -> DataSummary:
    return DataSummary(
        products_found=PRODUCTS_FOUND,
        date_from=date(2026, 1, 12),
        date_to=DATA_UNTIL,
        history_weeks=HISTORY_WEEKS,
        rows_read=ROWS_READ,
        rows_dropped=ROWS_DROPPED,
    )


def _short_history_warning() -> DataWarning:
    return DataWarning(
        code=WarningCode.SHORT_HISTORY,
        severity=WarningSeverity.WARNING,
        count=SHORT_HISTORY_PRODUCTS,
    )


def _tabular_plan() -> NormalizationPlan:
    return NormalizationPlan(
        sheet="Ventas",
        header_row=1,
        date=DateMapping(column="Fecha Doc", format="dd/mm/yyyy"),
        product_code=TextMapping(column="Cod Art"),
        product_name=TextMapping(column="Artículo"),
        quantity=QuantityMapping(column="Cant", decimal_separator=","),
        stock=None,
        unit=UnitMapping(column=None, default="u"),
    )


def _mappings() -> list[ColumnMapping]:
    return [
        ColumnMapping(
            field=MappedField.DATE,
            column="Fecha Doc",
            required=True,
            samples=["12/01/2026", "13/01/2026"],
            detail="dd/mm/yyyy",
        ),
        ColumnMapping(
            field=MappedField.PRODUCT_CODE,
            column="Cod Art",
            required=True,
            samples=SAMPLE_CODES,
            detail=None,
        ),
        ColumnMapping(
            field=MappedField.PRODUCT_NAME,
            column="Artículo",
            required=False,
            samples=["Ácido cítrico anhidro", "Glicerina vegetal USP"],
            detail=None,
        ),
        ColumnMapping(
            field=MappedField.QUANTITY,
            column="Cant",
            required=True,
            samples=["1.850,5", "320"],
            detail="decimal ,",
        ),
        ColumnMapping(
            field=MappedField.STOCK, column=None, required=False, samples=[], detail=None
        ),
        ColumnMapping(field=MappedField.UNIT, column=None, required=False, samples=[], detail=None),
    ]


def plans() -> dict[str, PlanView]:
    kardex = PlanView(
        source_kind=SourceKind.KARDEX,
        status=PlanStatus.PROPOSED,
        proposed_by=PlanAuthor.RULES,
        sheets=["Kardex"],
        selected_sheet="Kardex",
        plan=None,
        mappings=[],
        summary=_summary(),
        movement_rules=[
            MovementRule(code="01", label="Venta", treatment=MovementTreatment.DEMAND),
            MovementRule(
                code="05", label="Devolución de cliente", treatment=MovementTreatment.RETURN
            ),
            MovementRule(code="02", label="Importación", treatment=MovementTreatment.EXCLUDED),
            MovementRule(code="11", label="Transferencia", treatment=MovementTreatment.EXCLUDED),
            MovementRule(code="99", label="Ajuste", treatment=MovementTreatment.EXCLUDED),
        ],
        warnings=[_short_history_warning()],
        date_column_candidates=[],
    )
    tabular = PlanView(
        source_kind=SourceKind.TABULAR,
        status=PlanStatus.PROPOSED,
        proposed_by=PlanAuthor.LLM,
        sheets=["Ventas", "Resumen"],
        selected_sheet="Ventas",
        plan=_tabular_plan(),
        mappings=_mappings(),
        summary=_summary(),
        movement_rules=[],
        warnings=[
            _short_history_warning(),
            DataWarning(
                code=WarningCode.DROPPED_ROWS, severity=WarningSeverity.INFO, count=ROWS_DROPPED
            ),
            DataWarning(code=WarningCode.MISSING_STOCK, severity=WarningSeverity.INFO, count=None),
        ],
        date_column_candidates=[],
    )
    confirmed = tabular.model_copy(
        update={"status": PlanStatus.CONFIRMED, "proposed_by": PlanAuthor.USER}
    )
    no_date = PlanView(
        source_kind=SourceKind.TABULAR,
        status=PlanStatus.PROPOSED,
        proposed_by=PlanAuthor.RULES,
        sheets=["Stock"],
        selected_sheet="Stock",
        plan=None,
        mappings=[
            ColumnMapping(
                field=MappedField.DATE, column=None, required=True, samples=[], detail=None
            )
        ],
        summary=None,
        movement_rules=[],
        warnings=[],
        date_column_candidates=[
            DateColumnCandidate(column="Periodo", samples=["2026-01", "2026-02", "2026-03"]),
            DateColumnCandidate(column="Emisión", samples=["12/01/2026", "20/01/2026"]),
        ],
    )
    return {
        "kardex_proposed": kardex,
        "tabular_proposed": tabular,
        "tabular_confirmed": confirmed,
        "needs_date_column": no_date,
    }


def clarification() -> ClarificationPayload:
    return ClarificationPayload(
        questions=[
            ClarificationQuestion(
                id=ClarificationQuestionId.LEAD_TIME,
                options=[
                    ClarificationOption(value="7", label_key="clarification.leadTime.days7"),
                    ClarificationOption(value="14", label_key="clarification.leadTime.days14"),
                    ClarificationOption(value="30", label_key="clarification.leadTime.days30"),
                ],
                allows_other=True,
            ),
            ClarificationQuestion(
                id=ClarificationQuestionId.STOCKOUTS,
                options=[
                    ClarificationOption(
                        value=v.value, label_key=f"clarification.stockouts.{v.value}"
                    )
                    for v in HadStockouts
                ],
                allows_other=False,
            ),
        ],
        answers=None,
    )


def clarification_answered() -> ClarificationPayload:
    return clarification().model_copy(
        update={"answers": ClarificationAnswers(lead_time_days=30, had_stockouts=HadStockouts.NO)}
    )


def entry_flow() -> dict[str, object]:
    ticket = UploadTicket(
        upload_id=uid("upload-conv-uploaded"),
        upload_url="https://storage.example.invalid/object/upload/sign/uploads/mock?token=mock",
        headers={"content-type": XLSX},
        expires_at=NOW + timedelta(minutes=10),
    )
    return {
        "upload_ticket": ticket.model_dump(mode="json"),
        "upload_completed": UploadCompleted(
            conversation_id=uid("conv-uploaded"), job_id=uid("job-conv-digesting")
        ).model_dump(mode="json"),
        "jobs": {k: v.model_dump(mode="json") for k, v in jobs().items()},
        "plans": {k: v.model_dump(mode="json") for k, v in plans().items()},
        "clarification": clarification().model_dump(mode="json"),
        "clarification_answered": clarification_answered().model_dump(mode="json"),
        "forecast_accepted": JobAccepted(
            job_id=uid("job-conv-calculating"), conversation_id=uid("conv-calculating")
        ).model_dump(mode="json"),
    }


def errors() -> dict[str, object]:
    def problem(
        status: int, title: str, code: str, key: str, fields: list[FieldIssue] | None = None
    ) -> object:
        return ApiError(
            title=title,
            status=status,
            code=code,
            message_key=key,
            ref=SUPPORT_REF,
            request_id="req-mock-1",
            fields=fields or [],
        ).model_dump(mode="json")

    return {
        "not_found": problem(404, "Not Found", "not_found", "errors.notFound"),
        "validation": problem(
            422,
            "Unprocessable Content",
            "validation_error",
            "errors.validation",
            fields=[FieldIssue(field="full_name", code="string_too_short")],
        ),
        "rate_limited": problem(429, "Too Many Requests", "rate_limited", "errors.rateLimited"),
        "failure": problem(500, "Internal Server Error", "internal_error", "errors.internal"),
    }
