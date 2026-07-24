# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Open source readiness: CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md, CHANGELOG.md
- GitHub issue templates (bug report, feature request, question)
- Dependabot configuration for automated dependency updates
- GitHub Actions CI badges in README
- Comprehensive open-source documentation links in README

### Changed
- Updated package.json with homepage, bugs, funding, keywords for discoverability
- Updated LICENSE year to current
- Enhanced README with badges and contribution links

### Security
- Added SECURITY.md with vulnerability reporting process

## [0.1.0] - 2024-01-XX

### Added
- Initial release of Hermes AI Control Center
- Multi-account WhatsApp gateway (Baileys) with QR/pairing, session persistence, auto-reconnect
- Provider-agnostic AI engine (OpenAI-compatible endpoints)
- Hermes supervisor: rules engine + LLM judgement with risk/confidence scoring
- CRM: customers, conversations, messages, tags, lead stages, bulk actions
- Knowledge bases & items with optional RAG (pgvector embeddings)
- Product catalog with CSV/Google Sheets/Database sync sources
- Media library with trigger keywords and auto-send capability
- Controlled outbound campaigns with rate limits, preview, approval, personalization
- Analytics: response times, AI quality/fallback, message volume, CSAT, campaign delivery, closing funnel
- Role-based access: owner > supervisor > admin > viewer
- Real-time dashboard via Socket.IO
- AI self-learning proposals from chat history
- Hermes Agent integration for outbound alerts and CRM report pulling
- Structured logging, Prometheus metrics, health endpoints
- Docker Compose for local and production deployment

---

## Release Types

- **Major** (`x.0.0`): Breaking changes, major architecture shifts
- **Minor** (`0.x.0`): New features, backward compatible
- **Patch** (`0.0.x`): Bug fixes, security patches, backward compatible

## Links

- [Keep a Changelog](https://keepachangelog.com/)
- [Semantic Versioning](https://semver.org/)
- [Conventional Commits](https://www.conventionalcommits.org/)