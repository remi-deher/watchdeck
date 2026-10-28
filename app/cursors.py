"""Filter-bound seek cursors with explicit null ordering and stable tie breakers."""

import base64
import hashlib
import json
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import and_, false, or_, tuple_


def scope_for(values):
    return hashlib.sha256(json.dumps(values, sort_keys=True, default=str).encode()).hexdigest()[:24]


def encode_cursor(scope, values):
    raw = json.dumps([1, scope, values], default=lambda v: v.isoformat(), separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def seek(cursor, scope, columns):
    try:
        if len(cursor) > 4096:
            raise ValueError()
        version, saved_scope, values = json.loads(base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4)))
        if version != 1 or saved_scope != scope or len(values) != len(columns):
            raise ValueError()
        result, prefix = [], []
        for (column, descending, nulls_first), value in zip(columns, values):
            if value is not None:
                expected = column.type.python_type
                value = datetime.fromisoformat(value) if expected is datetime else expected(value)
            if value is None:
                after = column.isnot(None) if nulls_first else false()
            else:
                after = column < value if descending else column > value
                if not nulls_first:
                    after = or_(after, column.is_(None))
            result.append(and_(*prefix, after))
            prefix.append(column.is_(None) if value is None else column == value)
        if (
            all(not column.nullable for column, _, _ in columns)
            and len({descending for _, descending, _ in columns}) == 1
        ):
            left, right = tuple_(*(c for c, _, _ in columns)), tuple_(*values)
            return left < right if columns[0][1] else left > right
        condition = or_(*result)
        first, descending, nulls_first = columns[0]
        value = values[0]
        if value is not None:
            value = (
                datetime.fromisoformat(value) if first.type.python_type is datetime else first.type.python_type(value)
            )
            bound = first <= value if descending else first >= value
            if not nulls_first and first.nullable:
                bound = or_(bound, first.is_(None))
            condition = and_(bound, condition)
        return condition
    except (ValueError, TypeError, KeyError, OverflowError, UnicodeError) as exc:
        raise HTTPException(422, "Curseur invalide ou filtres modifiés ; recommencez à la première page.") from exc
