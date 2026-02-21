Got it — you don’t need theory now.
You need **clear implementation instructions** for your existing `VideoBuilder` so it can produce **word-highlight (karaoke-style) subtitle animation**.

Below is a **single actionable implementation plan** tailored to your codebase.

---

# ✅ GOAL

Add support for:

> Words get highlighted (black background) exactly when spoken.

Example:

```
"I am working"
```

Timeline:

```
0.0–0.4   → highlight "I"
0.4–0.8   → highlight "am"
0.8–1.5   → highlight "working"
```

---

# 🧱 WHAT YOU ALREADY HAVE (GOOD NEWS)

Your system already supports:

✅ multiple `TextSegment`
✅ timed enable expressions
✅ background boxes (`box=1`)
✅ filter chaining

**You DO NOT need to modify `_build_filter_complex`.**

You only need a **higher-level generator**.

---

# 🧩 WHAT YOU NEED TO ADD

You will add:

```
karaoke text processor
```

that converts:

```
sentence + word timestamps
```

➡️ into multiple `TextSegment`s automatically.

---

# STEP 1 — Create Word Timing Model

Add this near `TextSegment`.

```python
class WordTiming(BaseModel):
    word: str
    start_sec: float
    end_sec: float
```

---

# STEP 2 — Add New Operation (IMPORTANT)

Extend `OPERATIONS`.

```python
"karaoke": OperationSpec(
    method="add_karaoke_text",
    many=False,
),
```

---

# STEP 3 — Implement Karaoke Builder Method

Add inside `VideoBuilder`.

```python
def add_karaoke_text(
    self,
    sentence: str,
    words: list[WordTiming],
    fontsize: int = 60,
    x: str = "(w-text_w)/2",
    y: str = "h-200",
):
```

---

## FULL IMPLEMENTATION

Paste this:

```python
def add_karaoke_text(
    self,
    sentence: str,
    words: list[WordTiming],
    fontsize: int = 60,
    x: str = "(w-text_w)/2",
    y: str = "h-200",
) -> "VideoBuilder":

    if not words:
        return self

    start_time = words[0].start_sec
    end_time = words[-1].end_sec

    # 1️⃣ Base sentence (always visible)
    self.add_text(
        TextSegment(
            start_sec=start_time,
            end_sec=end_time,
            text=sentence,
            fontsize=fontsize,
            x=x,
            y=y,
            fontcolor="white",
        )
    )

    # 2️⃣ Highlight words sequentially
    offset_px = 0
    letter_width_estimate = fontsize * 0.6

    for w in words:
        word_width = len(w.word) * letter_width_estimate

        self.add_text(
            TextSegment(
                start_sec=w.start_sec,
                end_sec=w.end_sec,
                text=w.word,
                fontsize=fontsize,
                x=f"{x}+{offset_px}",
                y=y,
                fontcolor="white",
                background=True,
                boxcolor="black@1.0",
                boxborderw=12,
            )
        )

        # advance offset (+ space)
        offset_px += word_width + letter_width_estimate

    return self
```

---

# STEP 4 — Use It

Example:

```python
builder.add_karaoke_text(
    sentence="I am working",
    words=[
        WordTiming(word="I", start_sec=0.0, end_sec=0.4),
        WordTiming(word="am", start_sec=0.4, end_sec=0.8),
        WordTiming(word="working", start_sec=0.8, end_sec=1.5),
    ]
)
```

Done.

Your pipeline now generates:

```
drawtext(base sentence)
drawtext(word highlight 1)
drawtext(word highlight 2)
drawtext(word highlight 3)
```

automatically.

---

# STEP 5 — (OPTIONAL BUT STRONGLY RECOMMENDED)

Add new JSON loader support:

Input JSON:

```json
{
  "op": "karaoke",
  "data": {
    "sentence": "I am working",
    "words": [
      {"word":"I","start_sec":0,"end_sec":0.4},
      {"word":"am","start_sec":0.4,"end_sec":0.8},
      {"word":"working","start_sec":0.8,"end_sec":1.5}
    ]
  }
}
```

Modify `load()` slightly:

```python
if op == "karaoke":
    return self.add_karaoke_text(**data)
```

(No need for model validation unless you want.)

---

# STEP 6 — Where Word Timings Come From

Later you plug:

✅ Whisper word timestamps
✅ ElevenLabs alignment
✅ Deepgram word timings

Example Whisper output:

```json
{
 "word": "working",
 "start": 0.82,
 "end": 1.48
}
```

→ directly map to `WordTiming`.

---

# 🧠 RESULTING ARCHITECTURE

Your system becomes:

```
Audio
   ↓
Speech-to-text (word timestamps)
   ↓
Karaoke generator
   ↓
TextSegments
   ↓
FFmpeg drawtext filters
   ↓
Animated highlight subtitles
```

Exactly how TikTok / Reels captions work.

---
