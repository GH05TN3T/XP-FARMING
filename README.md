# Voznest XP Farming & Leveling Bot

Bot híbrido para la plataforma de comunicación **Voznest** (Voznest Forge) que combina un sistema de niveles y experiencia para miembros del servidor con un módulo automatizado de farming.

## 🚀 Características

* **Sistema de Niveles (XP Engine):**
  * Gana entre 15 y 25 XP al enviar mensajes en los canales.
  * Cooldown de 60 segundos por usuario para evitar spam.
  * Anuncios automáticos al subir de nivel con tarjetas Embed.
  * Tarjeta de perfil con `/rank` y barra de progreso.
  * Clasificación general con `/leaderboard`.
  * Comando administrativo `/give-xp` para moderadores.
* **Módulo de Auto-Farming:**
  * Ciclo de actividad con tiempo aleatorio (jitter) para un comportamiento natural.
  * Comandos de control `/farm-start`, `/farm-stop` y `/farm-status`.
* **Despliegue sencillo:**
  * Optimizado para ejecutarse en plataformas como **Veltramon.com**, Railway o VPS propio.

## 📋 Comandos Slash

* `/rank [who]`: Consulta tu nivel, XP actual y barra de progreso.
* `/leaderboard`: Muestra el Top 10 de usuarios con más XP en el hub.
* `/give-xp [who] [amount]`: Otorga XP manualmente a un usuario (Admin).
* `/farm-start [channel] [min_sec] [max_sec]`: Inicia el auto-farming en el canal.
* `/farm-stop`: Detiene el auto-farming.
* `/farm-status`: Estado del temporizador y estadísticas de farming.
* `/ping`: Revisa la latencia con la API y Gateway de Voznest.
* `/help`: Guía de comandos.

## ⚙️ Configuración

Copia `.env.example` a `.env` y añade tus credenciales desde [Voznest Forge](https://voznest.com/developers/projects):

```env
VOZNEST_API_URL=https://api.voznest.com
VOZNEST_APP_ID=tu_app_id
VOZNEST_BOT_TOKEN=qag_tu_token_aqui
```

## 📦 Instalación y Ejecución

```bash
npm install
npm start
```
