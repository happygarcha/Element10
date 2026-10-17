"""Provider adapters. Each data source states what it can and cannot supply, what it needs, and what
it costs. A provider that is not configured raises NotConfigured; the app never fakes its output."""

from __future__ import annotations

from dataclasses import dataclass, field


class NotConfigured(RuntimeError):
    """Raised when a provider is used without the credentials or account it needs."""


@dataclass
class ProviderInfo:
    id: str
    name: str
    status: str  # "ready", "needs credentials", "not built", "demo only"
    gives: list[str]
    does_not_give: list[str]
    requires: str
    cost: str
    verified: str  # what was checked and where
    docs: str = ""
    notes: list[str] = field(default_factory=list)
