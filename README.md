# Am I the Asshole? (AMA)

A simple web application where users can share situations and get perspective.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open your browser and navigate to:
```
http://localhost:3000
```

## Features

- Submit situations/stories
- **AI-powered judgment** - Get instant verdicts (YTA, NTA, ESH, NAH, INFO)
- View all submissions with judgments
- SQLite database for data persistence
- Modern, sleek UI
- Minimal overhead

## AI Analysis

The app includes AI analysis that provides judgments on submissions:

- **YTA** (You're The Asshole) - Red badge
- **NTA** (Not The Asshole) - Green badge  
- **ESH** (Everyone Sucks Here) - Orange badge
- **NAH** (No Assholes Here) - Blue badge
- **INFO** (Info Needed) - Gray badge

### Using OpenAI API (Optional)

For better AI analysis, you can use OpenAI's API:

1. Get an API key from https://platform.openai.com
2. Set it as an environment variable:
   ```bash
   export OPENAI_API_KEY=your_api_key_here
   npm start
   ```

Without an API key, the app uses a simple rule-based system that still provides judgments.

## API Endpoints

- `POST /api/submissions` - Create a new submission
  - Body: `{ "situation": "your text here" }`
  
- `GET /api/submissions` - Get all submissions
  - Query params: `?limit=50&offset=0`
  
- `GET /api/submissions/:id` - Get a specific submission by ID
