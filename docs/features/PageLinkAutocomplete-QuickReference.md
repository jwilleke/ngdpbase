# Page Link Autocomplete - Quick Reference

## One-Page Cheat Sheet

### 🚀 Quick Start

```
Editor:  Type [sys → Shows: SystemInfo, System Variables...
Search:  Type sys  → Shows: Matching pages dropdown
Result:  Click or press Enter to select
```

---

### 📍 Where It Works

| Location | Trigger | Action |
| ---------- | --------- | -------- |
| __Page Editor__ | Type `[page` | Inserts `[PageName]` |
| __Search Page__ | Type `query` | Navigate to page |
| __Header Search__ | Type `query` | Navigate to page |
| __Edit Index__ | Type `query` | Edit selected page |

---

### ⌨️ Keyboard Shortcuts

| Key | Action |
| ----- | -------- |
| `↓` | Next suggestion |
| `↑` | Previous suggestion |
| `Enter` | Select current |
| `Escape` | Close dropdown |

---

### 🎯 Smart Sorting

1. __Exact match__ - `home` → __HomePage__ (exact)
2. __Prefix match__ - `home` → __HomePages__ (starts with)
3. __Contains match__ - `home` → __MyHomePage__ (contains)
4. __Alphabetical__ - Within each priority group

---

### ✅ Best Practices

✓ Type at least __2 characters__
✓ Wait briefly (~200ms delay)
✓ Use arrow keys for speed
✓ Check category badges
✓ Type distinctive words

---

### ❌ Won't Trigger For

- Plugin syntax: `[{Image src='...'}]`
- Variable syntax: `[{$applicationname}]`
- Escaped text: `[[escaped content]`
- Already closed: `[HomePage] text`
- Less than 2 chars: `[h`

---

### 🔧 API Endpoint

```bash
# Request
GET /api/page-suggestions?q=system&limit=10

# Response
{
  "query": "system",
  "suggestions": [
    {
      "name": "SystemInfo",
      "slug": "systeminfo",
      "title": "SystemInfo",
      "category": "system"
    }
  ],
  "count": 1
}
```

---

### 🐛 Troubleshooting

__No dropdown?__

- Type 2+ characters
- Check browser console (F12)
- Verify in supported location

__Wrong results?__

- Type more characters
- Use distinctive words
- Check category badges

__Keyboard not working?__

- Click input field first
- Verify dropdown is open
- Check focus is in field

---

### 📊 Performance

- Response time: ~50-100ms (90 pages)
- Debounce delay: 200ms
- Max suggestions: 10 (default)
- Browser caching: Automatic

---

### 🔗 Related Features

- English Plural Matching (automatic)
- JSPWiki Variable Syntax: `[{$var}]`
- Standard Page Links: `[PageName]`
- Advanced Search (full-text)

---

### 📚 Full Documentation

- __User Guide:__ `/wiki/Page%20Link%20Autocomplete`
- __Technical Docs:__ `docs/features/PageLinkAutocomplete.md`
- __GitHub Issue:__ #90 - TypeDown for Internal Page Links

---

### 🎓 Common Patterns

__Create link while editing:__

```
1. Type: [sys
2. Arrow Down to System Variables
3. Press Enter
4. Result: [System Variables]
```

__Quick page navigation:__

```
1. Header search: home
2. Click HomePage
3. Navigate immediately
```

__Find page to edit:__

```
1. /edit-index search: test
2. Autocomplete shows options
3. Click to edit
```

---

### 💡 Pro Tips

- __Keyboard warriors:__ Use ↓↑ and Enter - never touch the mouse
- __Recent pages:__ Higher priority (future feature)
- __Categories:__ Use category badges to disambiguate similar names
- __Partial words:__ Type any part: "var" finds "System Variables"

---

### 📝 Configuration

__For Administrators:__

```javascript
// Adjust in page templates
new PageAutocomplete({
  minChars: 3,           // Require 3 chars
  maxSuggestions: 15,    // Show 15 results
  debounceMs: 300        // 300ms delay
})
```

---

### 🆕 Version Info

- __Version:__ 1.0.0
- __Released:__ October 12, 2025
- __Status:__ Production Ready
- __Issue:__ #90

---

*Print or bookmark this page for quick reference!*
