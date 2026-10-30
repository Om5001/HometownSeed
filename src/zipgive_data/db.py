"""Postgres access: migrations, bulk upserts, run logging."""
from __future__ import annotations

import json
import logging
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator, Sequence

import psycopg
from psycopg import sql

log = logging.getLogger(__name__)

SQL_DIR = Path(__file__).resolve().parents[2] / "sql"


def connect(database_url: str) -> psycopg.Connection:
    return psycopg.connect(database_url, autocommit=False)


def migrate(conn: psycopg.Connection, sql_dir: Path = SQL_DIR) -> list[str]:
    """Apply every sql/*.sql file in name order. Files are idempotent."""
    applied = []
    for f in sorted(sql_dir.glob("*.sql")):
        conn.execute(f.read_text())
        applied.append(f.name)
    conn.commit()
    log.info("Applied migrations: %s", ", ".join(applied))
    return applied


def upsert(
    conn: psycopg.Connection,
    table: str,
    rows: Sequence[dict],
    key: Sequence[str],
    columns: Sequence[str] | None = None,
) -> int:
    """Bulk upsert via COPY into a temp table, then INSERT ... ON CONFLICT."""
    if not rows:
        return 0
    columns = list(columns or rows[0].keys())
    tmp = f"_stage_{table}"
    ident_cols = sql.SQL(", ").join(map(sql.Identifier, columns))
    updates = sql.SQL(", ").join(
        sql.SQL("{c} = excluded.{c}").format(c=sql.Identifier(c))
        for c in columns if c not in key
    )
    with conn.cursor() as cur:
        cur.execute(sql.SQL(
            "create temp table {tmp} (like {t} including defaults) on commit drop"
        ).format(tmp=sql.Identifier(tmp), t=sql.Identifier(table)))
        with cur.copy(sql.SQL("copy {tmp} ({cols}) from stdin").format(
                tmp=sql.Identifier(tmp), cols=ident_cols)) as cp:
            for r in rows:
                cp.write_row([r.get(c) for c in columns])
        cur.execute(sql.SQL(
            "insert into {t} ({cols}) select {cols} from {tmp} "
            "on conflict ({key}) do update set {updates}, loaded_at = now()"
        ).format(
            t=sql.Identifier(table), cols=ident_cols, tmp=sql.Identifier(tmp),
            key=sql.SQL(", ").join(map(sql.Identifier, key)), updates=updates,
        ))
        n = cur.rowcount
    return n


@contextmanager
def run_log(conn: psycopg.Connection, job: str, params: dict) -> Iterator[dict]:
    """Record a pipeline run; the caller sets state['rows'] on success."""
    run_id = conn.execute(
        "insert into pipeline_runs (job, params, status) values (%s, %s, 'running') returning id",
        (job, json.dumps(params)),
    ).fetchone()[0]
    conn.commit()
    state = {"rows": None}
    try:
        yield state
        conn.commit()
        conn.execute(
            "update pipeline_runs set status='success', rows_loaded=%s, finished_at=now() where id=%s",
            (state["rows"], run_id),
        )
        conn.commit()
    except Exception as exc:
        conn.rollback()
        conn.execute(
            "update pipeline_runs set status='failed', error=%s, finished_at=now() where id=%s",
            (str(exc)[:2000], run_id),
        )
        conn.commit()
        raise
