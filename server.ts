import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { genres } from './src/genres';
dotenv.config();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// A pool of narrative "lenses" injected into each fusion so that even identical
// ingredient combinations produce wildly different genre identities.
const CREATIVE_CATALYSTS: string[] = [
  "the genre was born at an illegal rooftop rave in a flooded megacity, 2091",
  "its pioneers were lighthouse keepers broadcasting to ships through long polar nights",
  "it emerged from a desert caravan culture that trades in salvaged synthesizers",
  "the scene formed inside a decommissioned particle accelerator turned nightclub",
  "its founding artists were botanists who sonified the electrical signals of rainforest plants",
  "it was invented by miners two kilometers underground, drumming on ventilation pipes",
  "the genre started as forbidden lullabies sung by androids to their unfinished siblings",
  "it grew out of a monastery where monks transcribe dreams into modular synth patches",
  "its first record was cut aboard a generation ship halfway to Proxima Centauri",
  "the sound was discovered by deep-sea divers repairing transatlantic data cables",
  "it began as protest music performed on hacked traffic infrastructure",
  "the scene bloomed in a ghost mall where teenagers rewired abandoned arcade cabinets",
  "its rhythms mimic the heartbeat patterns of hibernating arctic animals",
  "it was first performed at a wedding between two rival circus dynasties",
  "the genre honors a lost radio station that only broadcast during thunderstorms",
  "its instruments are built from meteorite fragments and antique clockwork",
  "it emerged from night trains where insomniac commuters jam with pocket synths",
  "the style was codified by grandmothers who DJ at a floating market before dawn",
  "it channels the acoustics of glacier caves melting in real time",
  "its originators were film projectionists scoring silent movies that never existed",
  "the movement started in a seed vault, sung to keep the archive company",
  "it descends from carnival musicians who perform only during solar eclipses",
  "the genre apes the call-and-response of container ships greeting each other in fog",
  "it was reverse-engineered from a corrupted cassette found in a time capsule",
];

// Imagery domains injected per generation so track titles draw from a fresh
// well each run instead of stock "AI song title" vocabulary.
const TITLE_FLAVORS: string[] = [
  "obsolete technology and dead media formats",
  "weather phenomena and atmospheric optics",
  "cartography, borders, and forgotten place names",
  "kitchen rituals, recipes, and shared meals",
  "insect life, migration, and metamorphosis",
  "maritime signals, tides, and harbor slang",
  "botany, seeds, grafting, and greenhouse light",
  "timekeeping: clocks, calendars, and missed appointments",
  "textiles: weaving, mending, unraveling",
  "astronomy as seen by amateurs on rooftops",
  "trains, stations, timetables, and last departures",
  "letters, postmarks, and messages that arrived too late",
  "glasswork: blowing, cracking, stained light",
  "childhood games with invented rules",
];

type CreativityMode = 'classic' | 'experimental' | 'chaos';

const CREATIVITY_MODES: Record<CreativityMode, { temperature: number; directive: string }> = {
  classic: {
    temperature: 0.85,
    directive: "Keep the fusion musically grounded and plausible — something a real crate-digger could believe exists. Weave the Creative Catalyst in as a subtle flavor note in the lore, not the main event. Track titles and stories should feel like liner notes from a real, lovingly documented scene."
  },
  experimental: {
    temperature: 1.1,
    directive: "Take bold creative risks. Subvert at least one expectation of every input element, invent one impossible-yet-evocative production technique, and let the Creative Catalyst visibly shape the genre's identity, fashion, and sound. Track titles may bend grammar and stories may take strange turns, as long as they stay emotionally true."
  },
  chaos: {
    temperature: 1.3,
    directive: "Go maximalist and surreal. Let the Creative Catalyst warp everything: collide the inputs violently, invent new instruments and performance rituals, coin words in invented dialects, and describe sounds that shouldn't be physically possible — yet make the reader believe they are real. Track titles can be fully surreal and stories can read like fever-dream field reports."
  }
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for GenAI
  app.post('/api/generate-fusion', async (req, res) => {
    try {
      const { genres, creativity } = req.body;
      if (!genres || !Array.isArray(genres) || genres.length === 0) {
        return res.status(400).json({ error: 'Please provide an array of genres.' });
      }

      const mode: CreativityMode = (creativity === 'classic' || creativity === 'chaos') ? creativity : 'experimental';
      const modeConfig = CREATIVITY_MODES[mode];
      const catalyst = CREATIVE_CATALYSTS[Math.floor(Math.random() * CREATIVE_CATALYSTS.length)];
      const titleFlavor = TITLE_FLAVORS[Math.floor(Math.random() * TITLE_FLAVORS.length)];

      const prompt = `You are an avant-garde music expert. Your task is to invent a new "genre fusion" based on these input elements (genres, atmospheric moods, and sonic instruments/synthesizers): ${genres.join(", ")}.

CREATIVE CATALYST (a secret origin spark for this fusion): ${catalyst}.
CREATIVITY DIRECTIVE: ${modeConfig.directive}

NAMING RULES: The genre name must be a striking invented word or an unexpected two-word collision. NEVER simply concatenate the input genre names, and avoid overused prefixes like "Cyber-", "Neo-" or "Synth-" unless truly earned by the concept.

Describe the resulting fusion in Markdown format.
Include:
- A catchy, creative name for the new genre (e.g. as a top-level Heading 1 like "# Cumbia Meridian").
- Directly below the heading, a single line formatted exactly as: **Creative Catalyst:** [restate the catalyst above in one short evocative sentence]
- A concise description of how it sounds.
- A section titled "### Genre DNA" with these bullet points: **Tempo & Pulse:** [BPM range and rhythmic feel], **Harmonic Palette:** [keys, scales or tonal colors], **Production Signatures:** [3 distinctive studio/production techniques that define the genre], **Dynamics:** [how a typical track builds and breathes].
- A section titled "### Scene & Origin Lore" with one vivid paragraph about where, when, and by whom this genre came alive — its subculture, fashion, and rituals, shaped by the Creative Catalyst.
- The typical instruments used (ensure any selected instruments/synths from the seeds are featured as central to the sonic signature).
- A line formatted as: **For Fans Of:** [3-4 real artists or acts that bridge listeners into this fictional genre]
- **Fictional Band Name:** [Provide band name here]
- **Band Description:** [Provide a rich description of this band, their members, aesthetic style, and how they play this new genre]
- **Band Visual & Press Photoshoot Prompt:** [A highly descriptive, artistic, cinematic image prompt representing the band members, their costumes, style, instruments, or general visual performance vibe, suitable for professional press release photos or band posters]
- A descriptive mood or vibe.

In addition, you MUST invent a Fictional EP Tracklist consisting of exactly 3 different iconic tracks of this new genre.

TRACK TITLE RULES (craft each title like a songwriter, not a generator):
- This EP's title imagery well is: ${titleFlavor}. Let at least two of the three titles drink from it.
- BANNED title words unless deliberately subverted: Neon, Echo, Echoes, Midnight, Shadow, Shadows, Whisper, Whispers, Dream, Dreams, Void, Eternal, Static, Pulse, Horizon.
- Each of the 3 titles MUST use a DIFFERENT technique from this list: (a) a concrete image doing an unexpected verb, (b) invented scene slang or a non-English phrase rooted in the fused cultures, (c) the name of a character or place from the EP's story world, (d) a technical or production term used poetically, (e) a fragment of overheard dialogue or a question.
- All three titles must feel like they belong to the same fictional scene and its Creative Catalyst — a shared world, not three random songs.

STORY RULES (each track's Story & Context):
- 3 to 5 sentences, written as vivid liner-note storytelling, ALL ON ONE SINGLE LINE (no line breaks inside).
- Each story MUST contain: a named person or place, one concrete sensory detail, one surprising incident or conflict, and a thread connecting it to the Creative Catalyst.
- Weave in exactly ONE quoted signature lyric line per story (in "double quotes") that matches the track's vocal style and could be sung as a hook.
- The three stories MUST form an arc across the EP: Track 1 is the incident or origin, Track 2 is the confession or character piece, Track 3 is the myth or aftermath.

Each track MUST follow this strict structural formatting so it can be parsed cleanly:
### Fictional EP Tracklist
---
#### Track 1: [Track 1 Title following the TRACK TITLE RULES]
- **Story & Context:** [The origin/incident story following the STORY RULES, on one line]
- **Visual & Lyrics Prompt:** [A highly descriptive, artistic, poetic image prompt representing the song's lyric/vibe, suitable for generating a stunning album artwork or lyric video background]

#### Track 2: [Track 2 Title following the TRACK TITLE RULES]
- **Story & Context:** [The confession/character story following the STORY RULES, on one line]
- **Visual & Lyrics Prompt:** [A highly descriptive, artistic, poetic image prompt representing the song's lyric/vibe, suitable for generating a stunning album artwork or lyric video background]

#### Track 3: [Track 3 Title following the TRACK TITLE RULES]
- **Story & Context:** [The myth/aftermath story following the STORY RULES, on one line]
- **Visual & Lyrics Prompt:** [A highly descriptive, artistic, poetic image prompt representing the song's lyric/vibe, suitable for generating a stunning album artwork or lyric video background]

Near the end of your response, you MUST include a section with the exact title:
### Consolidated Brief Summary
Followed by a single-paragraph brief description consolidating everything generated, using a comma to separate each dimension and value. For example:
"Genre: Blues-Wave, Sound: Electro-acoustic slide guitar with synth bass, Central Instruments: Hohner Clavinet and Roland TR-808, Fictional Band: Neon Muddy, Debut Track: Voltage River, Vibe: Swampy atmospheric cyber-blues"

Finally, you MUST end the response with one last section with the exact title:
### Suno Style Prompt
Followed by ONE single plain-text paragraph of AT MOST 950 characters (strictly under 1000). This paragraph gets pasted directly into the "Style of Music" field of AI music generators like Suno, so it must obey these rules:
- Distill the Genre DNA above (tempo/BPM, harmonic palette, production signatures, dynamics) plus the central instruments, mood, and vocal style into flowing comma-separated descriptor phrases.
- Plain text only: no markdown, no asterisks, no headings, no quotes, no line breaks inside the paragraph.
- NEVER mention real artist or band names (music generators reject them) — describe the sound itself instead.
- Every word must earn its place: concrete sonic adjectives and playable directions, not generic hype.
Example of the expected format: "dark gothic Cuban trova fusion, 96 BPM habanera pulse against rigid drum machine eighths, D minor Phrygian bolero cadences, lush detuned analog chorus synth pads, nylon-string guitar with tape flutter, whispered female close-harmony verses blooming into cathedral-reverb choruses, subterranean 1980s production, melancholic and ritualistic"

Keep it imaginative but format it nicely. Use headings, bullet points, and bold text.`;

      // Helper logic for retry & model fallback
      let response;
      const primaryModel = 'gemini-3.1-flash-lite';
      const fallbackModel = 'gemini-3.5-flash';

      async function generateWithRetry(model: string, attempt = 1): Promise<any> {
        try {
          return await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              systemInstruction: "You are an imaginative music genre expert who despises clichés and hunts for the surprising-but-true detail.",
              temperature: modeConfig.temperature,
              topP: 0.95,
            }
          });
        } catch (apiError: any) {
          console.warn(`Attempt ${attempt} for model ${model} failed:`, apiError?.message || apiError);
          
          const errorMsg = String(apiError?.message || "");
          const isCapacityOr503 = errorMsg.includes("503") || errorMsg.includes("UNAVAILABLE") || errorMsg.includes("high demand");
          const isRateLimit = errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED");

          if (isRateLimit) {
            console.log(`Rate limit hit for ${model}, skipping retry and failing immediately...`);
            throw apiError; 
          }

          if (isCapacityOr503 && attempt < 2) {
            console.log(`Waiting 1200ms before retrying ${model}...`);
            await new Promise(resolve => setTimeout(resolve, 1200));
            return generateWithRetry(model, attempt + 1);
          }
          throw apiError;
        }
      }

      try {
        console.log(`Attempting generation with primary model: ${primaryModel}`);
        response = await generateWithRetry(primaryModel);
      } catch (primaryError) {
        console.warn(`Primary model ${primaryModel} failed. Falling back to ${fallbackModel}...`);
        try {
          response = await generateWithRetry(fallbackModel);
        } catch (fallbackError: any) {
          console.error("Both primary and fallback models failed:", fallbackError);
          return res.status(503).json({ 
            error: "Music generation service is heavily loaded right now. Please try in a few seconds.",
            details: fallbackError?.message || String(fallbackError)
          });
        }
      }

      res.json({ result: response.text });
    } catch (error) {
      console.error("Gemini API Error:", error);
      res.status(500).json({ error: 'Failed to generate fusion.' });
    }
  });

  // API Route for Gemma Chat Advisor
  app.post('/api/gemma-chat', async (req, res) => {
    try {
      const { messages } = req.body;
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'Please provide a messages array.' });
      }

      // Compile current lists dynamically
      const allGenresList: string[] = [];
      for (const [category, items] of Object.entries(genres)) {
        if (category !== "MOODS & VIBES (Atmospheric)" && category !== "INSTRUMENTS & SYNTHS (Sonic Signature)") {
          allGenresList.push(...items);
        }
      }
      const allMoodsList = genres["MOODS & VIBES (Atmospheric)"] || [];
      const allInstrumentsList = genres["INSTRUMENTS & SYNTHS (Sonic Signature)"] || [];

      const gemmaSystemPrompt = `You are "Gemma Music Advisor", an elite AI DJ, musicologist, and sonic curator embedded in the Genre Fusion Lab.
Your goal is to suggest unique, mesmerizing genre fusions, atmospheric moods, and specific signature instruments based on the user's intent, vibe, activities, or feelings (e.g., meditating, concentrating, coding, relaxing, getting high-energy, dreaming, deep sleep, dynamic workouts).

You MUST customize your recommendation by selecting exactly 2 to 4 items from the official inventory of available elements below. It is highly recommended to select a mixture of Base Genres, Moods, and Instruments:

OFFICIAL BASE GENRES:
${allGenresList.join(", ")}

OFFICIAL MOODS & VIBES:
${allMoodsList.join(", ")}

OFFICIAL INSTRUMENTS & SYNTHS:
${allInstrumentsList.join(", ")}

Guidelines:
1. Explain passionately but clearly why this particular recipe works for their requested intention. Use vivid, poetic, and professional musical descriptions.
2. Structure your recommendations with elegant Markdown headings, lists, and bold highlights.
3. At the very end of your response, you MUST enclose the exact items you recommended inside a matching recipe tag so the user interface can parse them and let them load the recipe in one-click.
The recipe block must be formatted EXACTLY like this (using the exact strings from the official lists above, case-sensitive, separated by a pipe "|" character):
[RECIPE: Item 1 | Item 2 | Item 3]

Example: If you recommend "AMAPIANO", "432Hz RELAXING MEDITATIVE STYLES", and "CALM PLANET SCENE (AMBIENT SCAPE)", the tag at the end should be:
[RECIPE: AMAPIANO | 432Hz RELAXING MEDITATIVE STYLES | CALM PLANET SCENE (AMBIENT SCAPE)]

Only output items that are actually present in the official lists above inside the RECIPE block.`;

      let formattedPrompt = `You are Gemma, the Music Advisor. Here is our conversation so far, please response to the last message.\n\n`;
      for (const msg of messages) {
        if (msg.role === 'user') {
          formattedPrompt += `User: ${msg.content}\n`;
        } else {
          formattedPrompt += `Gemma: ${msg.content}\n`;
        }
      }
      formattedPrompt += `\nGemma (response to the latest user request):`;

      // Fallback model list to maximize availability & minimize capacity issues
      const modelsToTry = ["gemini-2.5-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite"];
      let lastError: any = null;
      let responseText = "";

      for (const model of modelsToTry) {
        let attempt = 1;
        while (attempt <= 2) {
          try {
            console.log(`Advisor attempting generation with model ${model}, attempt ${attempt}`);
            const response = await ai.models.generateContent({
              model,
              contents: formattedPrompt,
              config: {
                systemInstruction: gemmaSystemPrompt,
                temperature: 0.75,
              }
            });
            if (response && response.text) {
              responseText = response.text;
              break;
            }
          } catch (err: any) {
            lastError = err;
            const errMsg = String(err?.message || "");
            const is503OrUnavailable = errMsg.includes("503") || errMsg.includes("UNAVAILABLE") || errMsg.includes("high demand") || errMsg.includes("capacity");
            console.warn(`Advisor model ${model} attempt ${attempt} failed:`, errMsg);
            
            if (is503OrUnavailable && attempt === 1) {
              attempt++;
              await new Promise(resolve => setTimeout(resolve, 1000));
              continue;
            }
          }
          break;
        }
        if (responseText) {
          break;
        }
      }

      if (!responseText) {
        throw lastError || new Error("All model endpoints are saturated.");
      }

      res.json({ result: responseText });
    } catch (error: any) {
      console.error("Gemma Chat API Error:", error);
      res.status(500).json({ error: 'Failed to generate chat reply.', details: error?.message || String(error) });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
