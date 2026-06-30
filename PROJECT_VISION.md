# hermes-cyberpunk-race

## 0. Original Vision
**Created:** 2026-06-30
**Source:** User request via Hermes TUI

> "Erstelle mit opencode ein cyberpunk 3d browser race game. Es soll 2 Modi geben:
> 1) Human vs Human (hier soll per websocket auf einen spieler gewartet werden)
> 2) Human vs AI (der ein spieler modus der gleich gestartet werden kann).
> Nutze hierfür das bereits erstellte private repo: https://github.com/jawwaonline/hermes-cyberpunk-race"

---

## 1. Current Vision

Ein browser-basiertes 3D Cyberpunk Racing Game mit:
- **Cyberpunk-Ästhetik**: Neon-Farben, dunkle Umgebungen, futuristische UI
- **Zwei Spielmodi**:
  1. **Human vs Human**: Warteraum via WebSocket → wenn zweiter Spieler beitritt → Start
  2. **Human vs AI**: Sofort startbarer Solo-Modus gegen KI-Gegner
- **Technologie**: Three.js (3D), WebSocket (Multiplayer), Node.js Server, Vanilla JS ESM

---

## 2. User Intent
Björn will ein spielbares 3D-Rennspiel im Browser mit Cyberpunk-Look. Kein Chat, Mario Kart Items, 3D, Single + Multiplayer Modi.

---

## 3. Research Findings
*To be filled by Research Hub*

---

## 4. Vision
### Must Have
- [ ] Cyberpunk-inspirierte 3D-Rennstrecke (dunkel, Neon-Elemente)
- [ ] Player-Car mit Lenkung (Pfeiltasten / WASD)
- [ ] KI-Gegner mit einfachem Pathfinding
- [ ] Human vs Human Modus: WebSocket-Warteraum, 2. Spieler startet das Rennen
- [ ] Human vs AI Modus: sofortiger Start gegen KI
- [ ] Runden-basiertes Rennergebnis (Wer finishet zuerst 3 Runden?)

### Should Have
- [ ] Neon-Glow-Effekte auf der Strecke
- [ ] Minimap
- [ ] Runden-Anzeige / Positionsanzeige

### Innovative Ideas
- [ ] Synthwave-Musik per Web Audio API
- [ ] "Boost" Powerup auf der Strecke

---

## 5. Prioritized Recommendations
Siehe Must Have oben.

---

## 6. Architecture
- **Frontend**: Three.js ESM, Vanilla JS, HTML5 Canvas
- **Backend**: Node.js WebSocket Server (ws/wswebsocket)
- **Multiplayer**: WebSocket room-based matchmaking
- **AI**: Einfacher State-Machine KI-Gegner
- **Deployment**: Docker + Coolify

---

## 7. Vertical Slices
1. **Slice 1**: Projekt-Skelett (package.json, Dockerfile, Ordnerstruktur, leerer Three.js Scene)
2. **Slice 2**: 3D-Strecke + Player-Car mit Steuerung
3. **Slice 3**: Human vs AI Modus (sofort startbar)
4. **Slice 4**: Human vs Human WebSocket Warteraum + Matchmaking
5. **Slice 5**: Runden-System, Ziellinie, Positionsanzeige
6. **Slice 6**: Cyberpunk-UI (Neon-Styling, Rundenanzeige, Modus-Auswahl)
7. **Slice 7**: KI-Verbesserung + Wrap-up

---

## 8. Grill-Me Findings
*To be filled after Grill-Me phase*

---

## 9. Deployment
- **GitHub**: jawwaonline/hermes-cyberpunk-race
- **Coolify**: Noch nicht konfiguriert
- **URL**: TBD

---

## 10. Lessons Learned
*To be filled after project completion*
