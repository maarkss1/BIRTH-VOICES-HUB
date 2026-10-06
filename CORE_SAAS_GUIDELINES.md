# CoreSaaS Platform - Architecture & Guidelines

This document outlines the architecture, specifications, and development guidelines for the new CoreSaaS Platform, focusing on 12 essential requirements to ensure scalability, security, and maintainability before production deployment.

## 1. System Document (PRD)
The specification is the single source of truth for the business.

-   **Purpose:** Provide a scalable platform where multiple companies can manage their resources in an isolated and secure manner.
-   **Core Scope:** User authentication, profile management, central dashboard module, billing, and integration management.
-   **Fundamental Business Rules:**
    -   No user can exist without being linked to at least one *Tenant* (Organization).
    -   Canceling a subscription immediately blocks access but retains data for 90 days (compliance).
-   **Functional Flows:** `Account Onboarding -> User Invitation -> Module Configuration (App Store) -> Core Usage -> Billing`.

## 2. System Map (UML and Architecture)
We will use a modular monolith (Clean Architecture) evolving towards microservices.

*Representation of layers and flow:*

-   **Frontend (React/Vite)** → Communicates via HTTPS with the edge layer.
-   **API Gateway / WAF** → Intercepts traffic, performs rate-limiting, and routes to the Backend.
-   **Core Module (Node.js)** → Processes Auth, Tenant management, and Business Rules.
-   **Database (PostgreSQL)** → Stores data with Row Level Security (RLS) enabled.
-   **Redis/BullMQ** → Manages heavy background tasks (reports, sending emails).

## 3. Access Rules Table (RBAC)
Control will be role-based, injected into the JWT token:

| Resource/Module | Administrator (Owner) | Manager (Manager) | User (Member) |
| :--- | :---: | :---: | :---: |
| **Billing** | Create/Read/Update/Delete | Read | Denied |
| **Users** | Create/Read/Update/Delete | Create/Read/Update | Read (Team Only) |
| **Core Modules** | Create/Read/Update/Delete | Create/Read/Update/Delete | Create/Read/Update |

## 4. Multi-user Architecture (Multi-tenant)
We will implement the **Logical Silo (Shared Data Pool)** model:

-   All database tables will have a mandatory `tenant_id` column.
-   The application **never** trusts the `tenant_id` sent in the payload. The `tenant_id` is always extracted and validated from the server-signed JWT token.

## 5. Database Locks (Constraints & RLS)
To ensure a code bug does not result in a data leak:

-   **Physical Constraints:** Strict use of Foreign Keys (FKs) and Constraints (e.g., `UNIQUE (email, tenant_id)`).
-   **Row Level Security (RLS) in PostgreSQL:** We will configure database policies that intercept all queries.
    -   *Example rule:* `CREATE POLICY tenant_isolation ON users FOR ALL USING (tenant_id = current_setting('app.current_tenant_id'));`

## 6. Prohibition of Passwords/Secrets in Code
**Zero tolerance for exposed keys (Hardcoded secrets):**

-   **Development:** Use of `.env` which is strictly ignored in the repository.
-   **Production:** The code will dynamically fetch credentials from a **Secrets Manager** during container initialization (boot).
-   **CI/CD:** Scanning tools will block commits containing secrets.

## 7. App Store / Feature Flags
Modularity will be achieved through a Feature Flags-oriented architecture.

-   Clients on different plans will have modules dynamically activated/deactivated via the database (`tenant_features`).
-   The backend will reject deactivated routes via middleware, and the frontend will hide corresponding UI elements.

## 8. Issue Reporting Module
-   **Global UI Button:** A quick "Report Bug" modal.
-   **Automatic Context Capture:** Silently sends: User ID, Tenant ID, current URL, console logs, failed network requests, and application version.
-   Direct integration with the Engineering team's dashboard.

## 9. Automated Tests
Strict code approval:

-   **Unit Tests (Vitest):** Minimum of 80% coverage.
-   **Integration:** Validates API routes against a real test database, validating RLS.
-   **End-to-End (E2E):** Bots simulating critical usage flows in the interface.

## 10. Security Audit (Pentest)
Security integrated into the lifecycle (DevSecOps):

-   **SAST and DAST:** Vulnerability scanning in code (SonarQube) and dynamic routes on every Pull Request.
-   **Human Pentest:** Mandatory bi-annual testing windows.

## 11. Edge Protection (Shield/WAF)
The system is not directly exposed to the public internet.

-   **Web Application Firewall (WAF):** Active rules against DDoS and injections.
-   **Rate Limiting:** Blocks IPs that exceed the limit of sensitive requests (e.g., Login, Password Reset) to mitigate Brute Force.

## 12. Encryption / HTTPS
-   **In Transit:** Communication strictly via TLS 1.2+ and HSTS policy enabled.
-   **At Rest:** Encrypted database disks.
-   Strong hash passwords (Bcrypt) and ultra-sensitive data encrypted before saving to the database.
