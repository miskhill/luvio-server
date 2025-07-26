# Luvio Server

Express.js server for the Luvio application.

## Getting Started

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file from the example:
   ```bash
   cp .env.example .env
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

   Or start the production server:
   ```bash
   npm start
   ```

The server will be running at `http://localhost:3000`

## Available Scripts

- `npm start` - Start the production server
- `npm run dev` - Start the development server with nodemon
- `npm test` - Run tests (not implemented yet)

## API Endpoints

- `GET /` - Welcome message and server status
- `GET /health` - Health check endpoint

## Environment Variables

See `.env.example` for required environment variables.
