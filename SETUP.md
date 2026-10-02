# Chirp Developer Setup & Runbook

## Prerequisites
- Node.js >= 20.x
- pnpm >= 9.x

## Quickstart (Under 2 Minutes)
1. **Install Dependencies**
   ```bash
   pnpm install
   ```
2. **Generate Protobuf Code**
   ```bash
   pnpm run proto:generate
   ```
3. **Initialize Database**
   ```bash
   pnpm run db:migrate
   pnpm run db:seed
   ```
4. **Start Development Servers**
   ```bash
   pnpm run dev
   ```
   - User Web Client: `http://localhost:3000`
   - Admin Client: `http://localhost:3002`
   - Backend API & gRPC: `http://localhost:3001`

## Testing & Quality Gates
- **Unit Tests**: `pnpm run test:unit`
- **Linting & Formatting**: `pnpm run lint` / `pnpm run format`
- **Type Checking**: `pnpm run typecheck`
- **Full Build**: `pnpm run build`
