const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcrypt');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

// AI analysis function - always returns YTA or NTA with a 1-10 score
// Score: 1 = definitely not the asshole, 10 = definitely the asshole
async function analyzeSituation(situation, followUpContext = null) {
  // Combine original situation with follow-up context if provided
  const fullContext = followUpContext 
    ? `${situation}\n\nAdditional context: ${followUpContext}`
    : situation;
  
  const situationLower = fullContext.toLowerCase();
  
  // Default values
  let judgment = 'NTA';
  let score = 5; // Neutral middle ground
  let reasoning = 'Based on the situation described, ';
  
  // If OpenAI API key is provided, use it for better analysis
  // Supports OpenAI and OpenAI-compatible APIs (like Nebius, Together AI, etc.)
  if (process.env.OPENAI_API_KEY) {
    try {
      const OpenAI = require('openai');
      const apiConfig = {
        apiKey: process.env.OPENAI_API_KEY
      };
      
      let apiProvider = 'OpenAI';
      // If NEBUIS_API_BASE_URL is set, use it (for Nebius or other OpenAI-compatible providers)
      if (process.env.NEBUIS_API_BASE_URL) {
        apiConfig.baseURL = process.env.NEBUIS_API_BASE_URL;
        apiProvider = 'Nebius';
        console.log('🤖 Using Nebius API:', process.env.NEBUIS_API_BASE_URL);
      } else if (process.env.OPENAI_API_BASE_URL) {
        // Fallback to OPENAI_API_BASE_URL for other providers
        apiConfig.baseURL = process.env.OPENAI_API_BASE_URL;
        apiProvider = 'Custom OpenAI-compatible';
        console.log('🤖 Using custom API:', process.env.OPENAI_API_BASE_URL);
      } else {
        console.log('🤖 Using OpenAI API (default)');
      }
      
      const openai = new OpenAI(apiConfig);
      
      // Use custom model if provided (for Nebius or other providers), otherwise default to gpt-3.5-turbo
      const model = process.env.AI_MODEL || 'gpt-3.5-turbo';
      console.log(`🤖 Using model: ${model} via ${apiProvider}`);
      
      const completion = await openai.chat.completions.create({
        model: model,
              messages: [
                {
                  role: 'system',
                  content: 'You are a fair and honest judge for "Am I the Asshole?" scenarios. Your priority is accuracy and truthfulness. Be direct, clear, and thoughtful in your analysis. Consider all perspectives and context. Use engaging but respectful language. Always determine if the person is the asshole (YTA) or not (NTA). Then provide a score from 1-10 where 1 means definitely not the asshole and 10 means definitely the asshole. Format your response as: YTA/NTA [score]/10 - [your clear, honest reasoning]. Be fair, accurate, and helpful.'
                },
                {
                  role: 'user',
                  content: `Analyze this situation carefully and determine if they are the asshole: ${fullContext}\n\nConsider all perspectives and context. Respond with: YTA or NTA, then a score 1-10, then your clear, honest reasoning. Be fair and accurate.`
                }
              ],
              max_tokens: 250,
              temperature: 0.7
      });
      
      const response = completion.choices[0].message.content;
      console.log(`✅ ${apiProvider} API response received:`, response.substring(0, 100) + '...');
      
      // Parse response: Look for YTA/NTA and score
      const responseUpper = response.toUpperCase();
      
      // Determine judgment
      if (responseUpper.includes('YTA') || responseUpper.includes('YOU\'RE THE ASSHOLE') || responseUpper.includes('YOU ARE THE ASSHOLE')) {
        judgment = 'YTA';
      } else {
        judgment = 'NTA';
      }
      
      // Extract score (look for pattern like "8/10" or "score: 7" or just a number)
      const scoreMatch = response.match(/(\d+)\s*\/\s*10/i) || response.match(/score[:\s]+(\d+)/i) || response.match(/\b([1-9]|10)\b/);
      if (scoreMatch) {
        score = parseInt(scoreMatch[1]);
        // Ensure score is between 1-10
        if (score < 1) score = 1;
        if (score > 10) score = 10;
      } else {
        // Default score based on judgment
        score = judgment === 'YTA' ? 7 : 3;
      }
      
      // Extract reasoning (everything after the score or judgment)
      const reasoningMatch = response.match(/[-–—]\s*(.+)/) || response.match(/:\s*(.+)/);
      if (reasoningMatch && reasoningMatch[1].trim().length > 10) {
        // Only use match if it has substantial content (more than 10 chars)
        reasoning = reasoningMatch[1].trim();
      } else {
        // Remove judgment and score from response to get reasoning
        reasoning = response
          .replace(/^(YTA|NTA)[:\s]*/i, '')
          .replace(/\d+\s*\/\s*10[:\s]*/i, '')
          .replace(/score[:\s]*\d+[:\s]*/i, '')
          .replace(/here'?s why[:\s]*/i, '')
          .replace(/why[:\s]*/i, '')
          .trim();
        
        // If reasoning is empty or too short, provide fallback
        if (!reasoning || reasoning.length < 10) {
          reasoning = judgment === 'YTA' 
            ? 'Based on the situation described, your actions were inappropriate and harmful to others.'
            : 'Based on the situation described, your actions were reasonable and justified.';
        }
      }
      
      // Ensure reasoning isn't empty
      if (!reasoning || reasoning.trim().length === 0) {
        reasoning = judgment === 'YTA' 
          ? 'Based on the situation described, your actions were inappropriate and harmful to others.'
          : 'Based on the situation described, your actions were reasonable and justified.';
      }
      
      // Mark that AI was used
      return { judgment, score, reasoning, aiUsed: true, aiProvider: apiProvider };
      
    } catch (error) {
      console.error(`❌ ${apiProvider} API error:`, error.message);
      console.log('⚠️ Falling back to rule-based judgment system');
      // Fall back to rule-based system
      const result = analyzeWithRules(situationLower, fullContext);
      return { ...result, aiUsed: false, aiError: error.message };
    }
  } else {
    console.log('⚠️ No API key found - using rule-based judgment system');
    // Use rule-based system
    const result = analyzeWithRules(situationLower, fullContext);
    return { ...result, aiUsed: false };
  }
}

// Rule-based analysis fallback - Balanced and accurate version
function analyzeWithRules(situationLower, fullContext) {
  let judgment = 'NTA';
  let score = 5;
  let reasoning = '';
  
  // EXTREME YTA - Violence against children or vulnerable people (score 10)
  if ((situationLower.includes('kicked') || situationLower.includes('hit') || 
       situationLower.includes('punched') || situationLower.includes('slapped') ||
       situationLower.includes('pushed') || situationLower.includes('shoved') ||
       situationLower.includes('beat') || situationLower.includes('abused')) &&
      (situationLower.includes('kid') || situationLower.includes('child') || 
       situationLower.includes('baby') || situationLower.includes('toddler') ||
       situationLower.includes('minor') || situationLower.includes('elderly') ||
       situationLower.includes('old person') || situationLower.includes('disabled') ||
       situationLower.includes('animal') || situationLower.includes('pet') ||
       situationLower.includes('dog') || situationLower.includes('cat'))) {
    judgment = 'YTA';
    score = 10;
    const responses = [
      'Violence against a child is absolutely unacceptable. This is clearly wrong and you are the asshole.',
      'Physical harm to a child is not just asshole behavior - it\'s potentially criminal. You are clearly in the wrong here.',
      'You physically harmed a child. This is absolutely unacceptable and wrong. You are clearly the asshole here.',
      'Violence against a vulnerable person, especially a child, is never acceptable. You are definitely the asshole.'
    ];
    reasoning = responses[Math.floor(Math.random() * responses.length)];
  }
  // EXTREME YTA - Sexual assault, revenge porn, doxxing (score 10)
  else if (situationLower.includes('sexual assault') || situationLower.includes('raped') ||
           situationLower.includes('revenge porn') || situationLower.includes('nude') && situationLower.includes('shared') ||
           situationLower.includes('doxxed') || situationLower.includes('doxxing') ||
           situationLower.includes('leaked') && (situationLower.includes('address') || situationLower.includes('phone') || situationLower.includes('personal'))) {
    judgment = 'YTA';
    score = 10;
    const responses = [
      'This is literally illegal and you\'re asking if you\'re wrong? YES. You\'re not just an asshole, you\'re a criminal.',
      'Bro this is giving "I committed a crime and want validation" energy. No. Absolutely not. You\'re 100% the asshole.',
      'This is beyond asshole behavior. This is "call the police" behavior. What is wrong with you?',
      'You did WHAT? And you think there\'s any scenario where you\'re NOT the asshole? Delusional.'
    ];
    reasoning = responses[Math.floor(Math.random() * responses.length)];
  }
  // Strong YTA indicators - Physical violence (score 9)
  else if (situationLower.includes('kicked') || situationLower.includes('hit') || 
           situationLower.includes('punched') || situationLower.includes('violence') ||
           situationLower.includes('slapped') || situationLower.includes('beat') ||
           situationLower.includes('assaulted') || situationLower.includes('attacked') ||
           situationLower.includes('threw') && situationLower.includes('at') ||
           situationLower.includes('choked') || situationLower.includes('strangled')) {
    judgment = 'YTA';
    score = 9;
    const responses = [
      'Bro, you literally did something that would make a villain in a kids movie look like a saint. This is WILD.',
      'Okay so you\'re out here doing crimes and asking if you\'re the asshole? Yes. Obviously. The audacity is astronomical.',
      'This is giving "I know I messed up but maybe if I ask nicely people will say it\'s fine" energy. It\'s not fine. You\'re absolutely the asshole here.',
      'You did WHAT? And you\'re asking if YOU\'RE the problem? The math ain\'t mathing, my friend.'
    ];
    reasoning = responses[Math.floor(Math.random() * responses.length)];
  }
  // Strong YTA - Bigotry and discrimination (score 9)
  else if (situationLower.includes('racist') || situationLower.includes('racism') ||
           situationLower.includes('homophobic') || situationLower.includes('homophobia') ||
           situationLower.includes('transphobic') || situationLower.includes('transphobia') ||
           situationLower.includes('ableist') || situationLower.includes('ableism') ||
           situationLower.includes('fat shamed') || situationLower.includes('fat shaming') ||
           situationLower.includes('body shamed') || situationLower.includes('body shaming') ||
           situationLower.includes('slur') || situationLower.includes('n-word') ||
           situationLower.includes('f slur') || situationLower.includes('r-word')) {
    judgment = 'YTA';
    score = 9;
    const responses = [
      'Discrimination and bigotry are never acceptable. You are clearly the asshole here.',
      'Prejudiced behavior is wrong regardless of context. You are the asshole.',
      'Discrimination is never okay. You are clearly in the wrong here.',
      'This type of discriminatory behavior is unacceptable. You are the asshole.'
    ];
    reasoning = responses[Math.floor(Math.random() * responses.length)];
  }
  // Strong YTA - Serious wrongdoing (score 8-9)
  else if (situationLower.includes('cheated') || situationLower.includes('lied') ||
           situationLower.includes('stole') || situationLower.includes('betrayed') ||
           situationLower.includes('abused') || situationLower.includes('manipulated') ||
           situationLower.includes('gaslighted') || situationLower.includes('gaslighting') ||
           situationLower.includes('stalked') || situationLower.includes('stalking') ||
           situationLower.includes('threatened') || situationLower.includes('threat') ||
           situationLower.includes('blackmailed') || situationLower.includes('blackmail')) {
    judgment = 'YTA';
    score = 8;
    const responses = [
      'This behavior is clearly wrong and harmful. You are the asshole here.',
      'These actions are unacceptable and harmful to others. You are in the wrong.',
      'This type of behavior is not acceptable. You are the asshole.',
      'What you did was wrong and harmful. You are clearly the asshole in this situation.'
    ];
    reasoning = responses[Math.floor(Math.random() * responses.length)];
  }
  // Moderate YTA indicators (score 6-7)
  else if (situationLower.includes('selfish') || situationLower.includes('only thinking about myself') ||
           situationLower.includes('ignored') || situationLower.includes('dismissed') ||
           situationLower.includes('refused to help') || situationLower.includes('ghosted') ||
           situationLower.includes('ghosting') || situationLower.includes('publicly humiliated') ||
           situationLower.includes('embarrassed') && situationLower.includes('public') ||
           situationLower.includes('made fun of') || situationLower.includes('mocked') ||
           situationLower.includes('laughed at') || situationLower.includes('ridiculed') ||
           situationLower.includes('canceled') && situationLower.includes('birthday') ||
           situationLower.includes('ruined') && (situationLower.includes('wedding') || situationLower.includes('party') || situationLower.includes('event'))) {
    judgment = 'YTA';
    score = 7;
    const responses = [
      'This behavior shows a lack of consideration for others. You are the asshole here.',
      'Being this self-centered and ignoring others\' feelings is wrong. You are the asshole.',
      'This demonstrates a lack of empathy and consideration for others. You are in the wrong.',
      'Putting your own needs above others without consideration makes you the asshole.'
    ];
    reasoning = responses[Math.floor(Math.random() * responses.length)];
  }
  // Low-Moderate YTA (score 5-6)
  else if (situationLower.includes('yelled at') || situationLower.includes('screamed at') ||
           situationLower.includes('cussed out') || situationLower.includes('cursed at') ||
           situationLower.includes('insulted') || situationLower.includes('name called') ||
           situationLower.includes('called') && (situationLower.includes('stupid') || situationLower.includes('idiot') || situationLower.includes('dumb'))) {
    judgment = 'YTA';
    score = 6;
    const responses = [
      'Verbal aggression is not acceptable behavior. You are the asshole here.',
      'Losing your temper and being verbally aggressive is wrong, even when frustrated. You are the asshole.',
      'Verbal attacks are harmful and unacceptable. You are in the wrong here.',
      'Being verbally aggressive toward someone is not acceptable. You are the asshole.'
    ];
    reasoning = responses[Math.floor(Math.random() * responses.length)];
  }
  // Strong NTA indicators (score 1-2)
  else if (situationLower.includes('sorry') || situationLower.includes('apologize') ||
           situationLower.includes('tried to help') || situationLower.includes('did my best') ||
           situationLower.includes('boundary') || situationLower.includes('respect') ||
           situationLower.includes('stood up') && (situationLower.includes('bully') || situationLower.includes('abuse')) ||
           situationLower.includes('protected') || situationLower.includes('defended') ||
           situationLower.includes('reported') && (situationLower.includes('abuse') || situationLower.includes('harassment') || situationLower.includes('crime')) ||
           situationLower.includes('said no') || situationLower.includes('refused') && situationLower.includes('uncomfortable') ||
           situationLower.includes('walked away') || situationLower.includes('left') && situationLower.includes('toxic') ||
           situationLower.includes('cut off') && situationLower.includes('toxic') ||
           situationLower.includes('stopped') && situationLower.includes('abuse')) {
    judgment = 'NTA';
    score = 2;
    const responses = [
      'You\'re out here being a decent human being and someone is mad about it? That\'s their problem, not yours.',
      'You did nothing wrong and honestly, whoever is making you feel bad about this needs to touch grass.',
      'This is giving "I\'m being gaslit" energy. You\'re fine, they\'re the problem.',
      'You\'re literally just existing and being reasonable. If someone has an issue with that, that\'s a them problem.',
      'You stood up for what\'s right and someone is mad? Good. They should be mad. You\'re absolutely NTA.',
      'You protected someone or yourself? That\'s not asshole behavior, that\'s being a decent person. NTA all the way.'
    ];
    reasoning = responses[Math.floor(Math.random() * responses.length)];
  }
  // Moderate NTA indicators (score 3-4)
  else if (situationLower.includes('misunderstanding') || situationLower.includes('accident') ||
           situationLower.includes('didn\'t mean to') || situationLower.includes('unintentional') ||
           situationLower.includes('honest mistake') || situationLower.includes('genuine mistake') ||
           situationLower.includes('miscommunication') || situationLower.includes('misheard') ||
           situationLower.includes('misunderstood') || situationLower.includes('wasn\'t aware') ||
           situationLower.includes('didn\'t know') || situationLower.includes('wasn\'t informed') ||
           situationLower.includes('forgot') && !situationLower.includes('on purpose')) {
    judgment = 'NTA';
    score = 3;
    const responses = [
      'This sounds like a classic case of "oops, my bad" and honestly? Accidents happen. You\'re good.',
      'You didn\'t mean to cause drama and it shows. This is just life being messy, not you being an asshole.',
      'This is giving "I made a mistake but I\'m human" vibes. We all mess up sometimes, you\'re fine.',
      'Honestly? This seems like a genuine mistake. Unless you\'re secretly a supervillain, you\'re probably fine.',
      'You made an honest mistake and you\'re being reasonable about it? That\'s not asshole behavior, that\'s being human.',
      'This is just a misunderstanding. You\'re fine, don\'t stress about it.'
    ];
    reasoning = responses[Math.floor(Math.random() * responses.length)];
  }
  // Neutral/ambiguous (score 5)
  else {
    judgment = 'NTA';
    score = 5;
    const responses = [
      'This is giving "I have no idea what\'s happening but I\'m trying my best" energy. You\'re probably fine?',
      'The situation is messy but you seem reasonable enough. Could go either way honestly.',
      'This is peak "life is complicated" content. You\'re probably not the asshole, but who knows anymore?',
      'Honestly? This is giving neutral vibes. You\'re probably fine, but maybe think about it a bit more.'
    ];
    reasoning = responses[Math.floor(Math.random() * responses.length)];
  }
  
  return { judgment, score, reasoning };
}

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(express.static('.'));

// Trust proxy (needed for Railway and other hosting platforms)
app.set('trust proxy', 1);

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  proxy: true, // Trust the reverse proxy (Railway)
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Will be true if Railway sets HTTPS headers
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // 'none' needed for cross-site in production
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Initialize database
const db = new Database('ama.db');

// Create tables if they don't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    situation TEXT NOT NULL,
    judgment TEXT,
    reasoning TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

// Migrate existing table to add judgment, reasoning, user_id, follow_up_context, score, is_anonymous, and is_public columns if they don't exist
try {
  const tableInfo = db.prepare("PRAGMA table_info(submissions)").all();
  const hasJudgment = tableInfo.some(col => col.name === 'judgment');
  const hasReasoning = tableInfo.some(col => col.name === 'reasoning');
  const hasUserId = tableInfo.some(col => col.name === 'user_id');
  const hasFollowUp = tableInfo.some(col => col.name === 'follow_up_context');
  const hasScore = tableInfo.some(col => col.name === 'score');
  const hasIsAnonymous = tableInfo.some(col => col.name === 'is_anonymous');
  const hasIsPublic = tableInfo.some(col => col.name === 'is_public');
  
  if (!hasJudgment || !hasReasoning || !hasUserId || !hasFollowUp || !hasScore || !hasIsAnonymous || !hasIsPublic) {
    console.log('Migrating database schema...');
    if (!hasJudgment) {
      db.exec('ALTER TABLE submissions ADD COLUMN judgment TEXT');
    }
    if (!hasReasoning) {
      db.exec('ALTER TABLE submissions ADD COLUMN reasoning TEXT');
    }
    if (!hasUserId) {
      db.exec('ALTER TABLE submissions ADD COLUMN user_id INTEGER');
    }
    if (!hasFollowUp) {
      db.exec('ALTER TABLE submissions ADD COLUMN follow_up_context TEXT');
    }
    if (!hasScore) {
      db.exec('ALTER TABLE submissions ADD COLUMN score INTEGER DEFAULT 5');
    }
    if (!hasIsAnonymous) {
      db.exec('ALTER TABLE submissions ADD COLUMN is_anonymous INTEGER DEFAULT 0');
    }
    if (!hasIsPublic) {
      db.exec('ALTER TABLE submissions ADD COLUMN is_public INTEGER DEFAULT 1');
    }
    console.log('Database migration complete');
  }
} catch (error) {
  console.error('Migration error (this is OK if table is new):', error.message);
  // Continue anyway - columns might already exist
}

// Migrate users table to add is_admin column
try {
  const usersTableInfo = db.prepare("PRAGMA table_info(users)").all();
  const hasIsAdmin = usersTableInfo.some(col => col.name === 'is_admin');
  
  if (!hasIsAdmin) {
    console.log('Adding is_admin column to users table...');
    db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0');
  }
  
  // Always ensure 'vinz' is admin (runs every time server starts)
  const updateAdmin = db.prepare('UPDATE users SET is_admin = 1 WHERE username = ?');
  const result = updateAdmin.run('vinz');
  if (result.changes > 0) {
    console.log('Set user "vinz" as admin');
  } else {
    // Check if vinz user exists
    const vinzUser = db.prepare('SELECT id, username FROM users WHERE username = ?').get('vinz');
    if (vinzUser) {
      console.log('User "vinz" exists but admin flag was already set');
    } else {
      console.log('User "vinz" not found in database');
    }
  }
} catch (error) {
  console.error('Migration error (this is OK if table is new):', error.message);
}

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  return res.status(401).json({ error: 'Authentication required' });
}

// Admin middleware - requires authentication AND admin status
function requireAdmin(req, res, next) {
  if (!req.session || !req.session.userId) {
    console.log('Admin check failed: No session or userId');
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const user = db.prepare('SELECT id, username, is_admin FROM users WHERE id = ?').get(req.session.userId);
  console.log('Admin check for user:', { userId: req.session.userId, user: user, is_admin: user?.is_admin, type: typeof user?.is_admin });
  
  // SQLite stores integers, so check for truthy value (1 = true, 0 = false)
  // Also handle case where is_admin might be null or undefined
  if (!user || (user.is_admin !== 1 && user.is_admin !== true)) {
    console.log('Admin check failed: User is not admin');
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  console.log('Admin check passed');
  next();
}

// Authentication Routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }
    
    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    // Check if user already exists
    const existingUser = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
    if (existingUser) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Create user
    const stmt = db.prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)');
    const result = stmt.run(username, email, passwordHash);
    
    // Set session
    req.session.userId = result.lastInsertRowid;
    req.session.username = username;
    
    res.json({
      message: 'Registration successful',
      user: {
        id: result.lastInsertRowid,
        username,
        email
      }
    });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    // Find user
    const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username, username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    
    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    
    // Set session
    req.session.userId = user.id;
    req.session.username = user.username;
    
    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.json({ message: 'Logout successful' });
  });
});

app.get('/api/auth/me', (req, res) => {
  if (req.session && req.session.userId) {
    const user = db.prepare('SELECT id, username, email, created_at FROM users WHERE id = ?').get(req.session.userId);
    if (user) {
      return res.json({ user });
    }
  }
  res.status(401).json({ error: 'Not authenticated' });
});

// API Routes
app.post('/api/submissions', requireAuth, async (req, res) => {
  try {
    const { situation, isAnonymous, isPublic } = req.body;
    
    if (!situation || situation.trim().length === 0) {
      return res.status(400).json({ error: 'Situation is required' });
    }

    // Validate boolean values
    const anonymous = isAnonymous === true || isAnonymous === 'true' || isAnonymous === 1 ? 1 : 0;
    const publicSubmission = isPublic === true || isPublic === 'true' || isPublic === 1 ? 1 : 0;

    // Analyze the situation
    const analysis = await analyzeSituation(situation.trim());
    const { judgment, score, reasoning, aiUsed, aiProvider, aiError } = analysis;
    
    const stmt = db.prepare('INSERT INTO submissions (user_id, situation, judgment, score, reasoning, is_anonymous, is_public) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const result = stmt.run(req.session.userId, situation.trim(), judgment, score, reasoning, anonymous, publicSubmission);
    
    res.json({
      id: result.lastInsertRowid,
      judgment,
      score,
      reasoning,
      isAnonymous: anonymous === 1,
      isPublic: publicSubmission === 1,
      aiUsed: aiUsed || false,
      aiProvider: aiProvider || null,
      aiError: aiError || null,
      message: 'Submission created successfully'
    });
  } catch (error) {
    console.error('Error creating submission:', error);
    res.status(500).json({ error: 'Failed to create submission' });
  }
});

app.get('/api/submissions', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const showMineOnly = req.query.mine === 'true' || req.query.mine === '1';
    const currentUserId = req.session ? req.session.userId : null;
    
    // Build query - show username based on anonymous flag and view type
    // If showing "My Submissions", always show username (even if anonymous)
    // If showing "All Submissions", hide username if anonymous
    let query = `
      SELECT s.*, 
        CASE 
          WHEN ${showMineOnly ? '0' : 's.is_anonymous = 1'} THEN NULL
          ELSE u.username 
        END as username
      FROM submissions s 
      LEFT JOIN users u ON s.user_id = u.id 
      WHERE 1=1
    `;
    
    const params = [];
    
    // If showing only my submissions
    if (showMineOnly && currentUserId) {
      query += ' AND s.user_id = ?';
      params.push(currentUserId);
    } else {
      // Only show public submissions to non-owners, or all submissions if it's the owner
      if (currentUserId) {
        query += ' AND (s.is_public = 1 OR s.user_id = ?)';
        params.push(currentUserId);
      } else {
        // Not logged in - only show public submissions
        query += ' AND s.is_public = 1';
      }
    }
    
    query += ' ORDER BY s.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const stmt = db.prepare(query);
    const submissions = stmt.all(...params);
    
    // Get total count with same filters
    let countQuery = 'SELECT COUNT(*) as total FROM submissions WHERE 1=1';
    const countParams = [];
    
    if (showMineOnly && currentUserId) {
      countQuery += ' AND user_id = ?';
      countParams.push(currentUserId);
    } else {
      if (currentUserId) {
        countQuery += ' AND (is_public = 1 OR user_id = ?)';
        countParams.push(currentUserId);
      } else {
        countQuery += ' AND is_public = 1';
      }
    }
    
    const countStmt = db.prepare(countQuery);
    const { total } = countStmt.get(...countParams);
    
    res.json({
      submissions,
      total,
      limit,
      offset
    });
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

app.get('/api/submissions/:id', (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.session ? req.session.userId : null;
    
    const stmt = db.prepare(`
      SELECT s.*, 
        CASE 
          WHEN s.is_anonymous = 1 THEN NULL
          ELSE u.username 
        END as username
      FROM submissions s 
      LEFT JOIN users u ON s.user_id = u.id 
      WHERE s.id = ?
    `);
    const submission = stmt.get(id);
    
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    
    // Check if user can view this submission (must be public or owner)
    if (submission.is_public !== 1 && submission.user_id !== currentUserId) {
      return res.status(403).json({ error: 'This submission is private' });
    }
    
    res.json(submission);
  } catch (error) {
    console.error('Error fetching submission:', error);
    res.status(500).json({ error: 'Failed to fetch submission' });
  }
});

// Follow-up endpoint - submit additional context and re-analyze
app.post('/api/submissions/:id/followup', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { followUpContext } = req.body;
    
    // Validate ID is a number
    const submissionId = parseInt(id);
    if (isNaN(submissionId) || submissionId <= 0) {
      return res.status(400).json({ error: 'Invalid submission ID' });
    }
    
    if (!followUpContext || followUpContext.trim().length === 0) {
      return res.status(400).json({ error: 'Follow-up context is required' });
    }
    
    // Get the original submission
    const submission = db.prepare('SELECT * FROM submissions WHERE id = ?').get(submissionId);
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    
    // Verify ownership
    if (submission.user_id !== req.session.userId) {
      return res.status(403).json({ error: 'You can only add follow-up to your own submissions' });
    }
    
    // Re-analyze with the combined context
    const { judgment, score, reasoning } = await analyzeSituation(submission.situation, followUpContext.trim());
    
    // Validate judgment and reasoning are strings
    const safeJudgment = String(judgment || 'NTA').trim();
    const safeScore = Math.max(1, Math.min(10, parseInt(score) || 5));
    const safeReasoning = String(reasoning || '').trim();
    const safeFollowUp = String(followUpContext).trim();
    
    // Update the submission with follow-up context and new judgment
    const updateStmt = db.prepare(`
      UPDATE submissions 
      SET follow_up_context = ?, 
          judgment = ?, 
          score = ?,
          reasoning = ? 
      WHERE id = ?
    `);
    updateStmt.run(safeFollowUp, safeJudgment, safeScore, safeReasoning, submissionId);
    
    res.json({
      id: submissionId,
      judgment: safeJudgment,
      score: safeScore,
      reasoning: safeReasoning,
      followUpContext: safeFollowUp,
      message: 'Follow-up submitted and re-analyzed successfully'
    });
  } catch (error) {
    console.error('Error processing follow-up:', error);
    res.status(500).json({ error: error.message || 'Failed to process follow-up' });
  }
});

// Admin Routes - Protected by requireAdmin middleware
app.get('/api/admin/users', requireAdmin, (req, res) => {
  try {
    const stmt = db.prepare(`
      SELECT 
        id, 
        username, 
        email, 
        is_admin,
        created_at,
        (SELECT COUNT(*) FROM submissions WHERE user_id = users.id) as submission_count
      FROM users 
      ORDER BY created_at DESC
    `);
    const users = stmt.all();
    
    res.json({ users });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.get('/api/admin/stats', requireAdmin, (req, res) => {
  try {
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get();
    const totalSubmissions = db.prepare('SELECT COUNT(*) as count FROM submissions').get();
    const avgScore = db.prepare('SELECT AVG(score) as avg FROM submissions WHERE score IS NOT NULL').get();
    
    const ytaCount = db.prepare("SELECT COUNT(*) as count FROM submissions WHERE judgment = 'YTA'").get();
    const ntaCount = db.prepare("SELECT COUNT(*) as count FROM submissions WHERE judgment = 'NTA'").get();
    
    const submissionsByUser = db.prepare(`
      SELECT 
        u.username,
        COUNT(s.id) as submission_count,
        AVG(s.score) as avg_score
      FROM users u
      LEFT JOIN submissions s ON u.id = s.user_id
      GROUP BY u.id, u.username
      ORDER BY submission_count DESC
    `).all();
    
    res.json({
      totalUsers: totalUsers.count,
      totalSubmissions: totalSubmissions.count,
      averageScore: avgScore.avg ? parseFloat(avgScore.avg.toFixed(2)) : 0,
      ytaCount: ytaCount.count,
      ntaCount: ntaCount.count,
      submissionsByUser
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

app.get('/api/admin/submissions', requireAdmin, (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    
    const stmt = db.prepare(`
      SELECT 
        s.*, 
        u.username,
        u.email
      FROM submissions s 
      LEFT JOIN users u ON s.user_id = u.id 
      ORDER BY s.created_at DESC 
      LIMIT ? OFFSET ?
    `);
    const submissions = stmt.all(limit, offset);
    
    const countStmt = db.prepare('SELECT COUNT(*) as total FROM submissions');
    const { total } = countStmt.get();
    
    res.json({
      submissions,
      total,
      limit,
      offset
    });
  } catch (error) {
    console.error('Error fetching admin submissions:', error);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

// Serve index.html for root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Debug endpoint to check admin status
app.get('/api/debug/admin-status', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, username, is_admin FROM users WHERE id = ?').get(req.session.userId);
  res.json({
    sessionUserId: req.session.userId,
    user: user,
    isAdmin: user?.is_admin === 1,
    allUsers: db.prepare('SELECT id, username, is_admin FROM users').all()
  });
});

// Endpoint to manually set admin status (for fixing Railway database)
// GET version - just visit the URL in browser
app.get('/api/debug/set-admin/:username', requireAuth, async (req, res) => {
  try {
    const { username } = req.params;
    if (!username) {
      return res.status(400).json({ error: 'Username required' });
    }
    
    const updateAdmin = db.prepare('UPDATE users SET is_admin = 1 WHERE username = ?');
    const result = updateAdmin.run(username);
    
    if (result.changes > 0) {
      res.json({ message: `User "${username}" is now an admin`, changes: result.changes });
    } else {
      res.status(404).json({ error: `User "${username}" not found` });
    }
  } catch (error) {
    console.error('Error setting admin:', error);
    res.status(500).json({ error: 'Failed to set admin status' });
  }
});

// POST version
app.post('/api/debug/set-admin', requireAuth, async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) {
      return res.status(400).json({ error: 'Username required' });
    }
    
    const updateAdmin = db.prepare('UPDATE users SET is_admin = 1 WHERE username = ?');
    const result = updateAdmin.run(username);
    
    if (result.changes > 0) {
      res.json({ message: `User "${username}" is now an admin`, changes: result.changes });
    } else {
      res.status(404).json({ error: `User "${username}" not found` });
    }
  } catch (error) {
    console.error('Error setting admin:', error);
    res.status(500).json({ error: 'Failed to set admin status' });
  }
});

// Serve admin.html for admin dashboard (allow access to HTML, but API endpoints are protected)
app.get('/admin', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
