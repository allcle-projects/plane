# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import re

# Django imports
from django.contrib.postgres.search import TrigramSimilarity
from django.db.models import Q
from django.db.models.functions import Greatest

# Module imports


# Minimum pg_trgm similarity for a fuzzy (typo-tolerant) match. Substring
# (icontains) and exact matches are always kept in addition to this, so the
# threshold only *widens* the result set with near-miss / misspelled terms and
# never drops a result that already matched today.
TRIGRAM_SIMILARITY_THRESHOLD = 0.3


def trigram_rank(query, fields):
    """Relevance expression = greatest pg_trgm similarity between ``query`` and
    any of ``fields``. Used to annotate ``search_rank`` for ranking.
    """
    rank = None
    for field in fields:
        similarity = TrigramSimilarity(field, query)
        rank = similarity if rank is None else Greatest(rank, similarity)
    return rank


def ranked_search(queryset, query, text_fields, match_q):
    """Refine ``queryset`` for enhanced, typo-tolerant, ranked search.

    - Annotates ``search_rank`` (trigram relevance across ``text_fields``).
    - Filters to rows matching ``match_q`` (the existing icontains / exact
      lookups, so every current match is preserved) OR clearing the fuzzy
      trigram threshold (adds typo / near-miss matches).
    - Orders by relevance, then recency.

    When ``query`` is falsy the queryset is only ordered by recency, so callers
    keep their original (unfiltered) behavior.
    """
    if not query:
        return queryset.order_by("-created_at")
    return (
        queryset.annotate(search_rank=trigram_rank(query, text_fields))
        .filter(match_q | Q(search_rank__gte=TRIGRAM_SIMILARITY_THRESHOLD))
        .order_by("-search_rank", "-created_at")
    )


def search_issues(query, queryset):
    fields = ["name", "sequence_id", "project__identifier"]
    text_fields = ["name", "project__identifier"]
    q = Q()
    for field in fields:
        if field == "sequence_id" and len(query) <= 20:
            sequences = re.findall(r"\b\d+\b", query)
            for sequence_id in sequences:
                q |= Q(**{"sequence_id": sequence_id})
        else:
            q |= Q(**{f"{field}__icontains": query})
    return ranked_search(queryset, query, text_fields, q).distinct()
