# Hostile Environment Training - WebXR

Single-room Silk Road Training demonstration. Static site (A-Frame 1.8.0).

- `index.html` — landing page
- `room.html` — the scene
- `assets/` — images, models, videos, sounds, content, bridge scenario

Desktop and Quest load the sky and ruined building. iPhone and iPad Safari, in 2D and AR, do not.

Local Quest testing: `npm start`, then open `https://localhost:8080`. Vercel serves the files as a static site; it does not run the Node server.
