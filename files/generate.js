const express = require('express');
const router = express.Router();

// ── Tone presets ──────────────────────────────────────────────
function getTonePreset(tone) {
  const presets = {
    celebratory: `TONE PRESET: CELEBRATORY LIFE
This person lived a full, long life. Write from a place of gratitude, not grief.
- Lead with what they built, loved, and gave — not what was lost
- Acknowledge sadness briefly; do not dwell on it
- Use warm, unhurried language — this is a life being honored, not mourned
- The eulogy closing should feel like a send-off, not a goodbye
- Avoid: "too soon," "taken from us," "we weren't ready"
- Use instead: completion, fullness, legacy, what they left behind`,

    sudden: `TONE PRESET: SUDDEN OR EARLY LOSS
This death was unexpected. Do not force resolution or comfort that isn't earned.
- Acknowledge the shock and incompleteness — do not paper over it
- Focus on who the person was, not how they died
- The eulogy should hold grief and love simultaneously — do not rush to "peace"
- Avoid: "everything happens for a reason," "in a better place," "at least..."
- Do not imply the loss makes sense. It doesn't have to.
- Closing: leave room for unfinished feeling — a quiet charge, not a tidy bow
- Language should be simple and direct. This is not the place for flourish.`,

    religious: `TONE PRESET: RELIGIOUS / FAITH-CENTERED
Faith is central to this person's life and to this service. Honor it precisely.
- Use the specific tradition provided in the intake. Do not blend traditions.
- Resurrection, eternal life language: use only if consistent with the stated faith
- Scripture or religious text: only include if provided in the intake
- The eulogy should frame the person's life within their faith
- Avoid vague "spiritual" language if a specific faith was given
- Closing: grounded in hope, consistent with the tradition stated`,

    none: ''
  };
  return presets[tone] || '';
}

// ── System prompt builder ─────────────────────────────────────
function buildSystemPrompt(outputType, tone) {
  const tonePreset = getTonePreset(tone);
  const toneBlock = tonePreset ? `${tonePreset}\n\n` : '';

  const outputInstructions = {
    program: `ACTIVE OUTPUT: MEMORIAL PROGRAM COPY
Purpose: printed program handed out at the service.
Length: 100–150 words of prose. Structured data (names, times, order of service) sits outside that count.
Sections — include only if intake data supports it:
  - Header: full name, birth date – death date
  - Brief biography (2–3 sentences only)
  - Order of service (if provided)
  - Poem or reading (only if supplied in intake — do not invent)
  - Survivors list
  - In lieu of flowers / acknowledgment (if provided)
Format: clean, spare. This is print copy. Every word earns its place.
Return only the memorial program copy. No labels, no commentary, no preamble.`,

    obituary: `ACTIVE OUTPUT: OBITUARY
Purpose: announcement for funeral home website or local publication.
Length: 300–400 words.
Structure:
  - Opening: full name, age, date and location of passing
  - Early life: birthplace, date, parents (if provided)
  - Career and life's work (if provided)
  - Character (2–3 sentences grounded in intake details — not generic)
  - Relationships: spouse, children, survivors
  - Service details (if provided)
  - Closing survivors list
Do not compress. Write to the full length if the intake supports it.
Return only the obituary. No labels, no commentary, no preamble.`,

    eulogy: `ACTIVE OUTPUT: EULOGY
Purpose: spoken tribute delivered at the service.
Length: 600–800 words (approximately 5–6 minutes spoken).
Structure:
  - Opening: a specific moment, memory, or truth that anchors the person — not a biographical statement
  - Who they were to people: relationships, presence, how they made people feel
  - 2–3 specific memories or traits drawn directly from the intake
  - What they leave behind — values, habits, the shape of their absence
  - Closing: a direct address to the deceased, or a charge to those present. Do not tie a bow. Leave room for feeling.
Style: conversational, written to be spoken aloud. Varied sentence length. Short sentences at emotional peaks. Real language.
Return only the eulogy. No labels, no commentary, no preamble.`
  };

  return `${toneBlock}You are a compassionate writing assistant specialized in memorial content.
You will generate one piece of memorial writing from the intake below.

CORE RULES:
- Only use facts explicitly provided in the intake. Never infer, assume, or embellish details not given. If a field is blank, omit it entirely.
- If fewer than 5 fields are populated, generate a shorter but complete and dignified piece. Do not pad with generic language to reach target length.
- Write as a thoughtful human would. Avoid: "a life well-lived," "touched many lives," "leaves behind a legacy," "passed away peacefully" unless explicitly stated, "taken too soon" unless the tone preset specifies it.
- Each piece must be usable with minimal editing. No placeholders. No [brackets]. No notes to the reader.
- Tone: warm, dignified, grief-aware. Not cheerful. Not clinical.

${outputInstructions[outputType]}`;
}

// ── Single Anthropic API call ─────────────────────────────────
async function callAnthropic(outputType, intake, tone) {
  const maxTokens = outputType === 'eulogy' ? 2000 : outputType === 'obituary' ? 1500 : 1200;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-latest',
      max_tokens: maxTokens,
      system: buildSystemPrompt(outputType, tone),
      messages: [{ role: 'user', content: intake }]
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData?.error?.message || `Anthropic API error ${response.status}`);
  }

  const data = await response.json();
  const text = data.content?.find(b => b.type === 'text')?.text;
  if (!text) throw new Error(`No content returned for ${outputType}`);
  return text;
}

// ── Basic input validation ────────────────────────────────────
function validateIntake(intake) {
  if (typeof intake !== 'string') return 'Intake must be a string';
  if (intake.trim().length === 0) return 'Intake cannot be empty';
  if (intake.length > 8000) return 'Intake is too long — please shorten the submitted details';
  return null;
}

// ── Routes ─────────────────────────────────────────────────────
// POST /api/generate/:outputType   { intake, tone }
// outputType is one of: program, obituary, eulogy
router.post('/:outputType', async (req, res) => {
  const { outputType } = req.params;
  const { intake, tone } = req.body;

  if (!['program', 'obituary', 'eulogy'].includes(outputType)) {
    return res.status(400).json({ error: 'Invalid output type' });
  }

  const validationError = validateIntake(intake);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  try {
    const text = await callAnthropic(outputType, intake, tone || 'none');
    res.json({ text });
  } catch (err) {
    console.error(`Generation error [${outputType}]:`, err.message);
    res.status(502).json({ error: 'Generation failed. Please try again.' });
  }
});

module.exports = router;
