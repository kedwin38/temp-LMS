# Deployment

This repository is prepared for a Vercel frontend and Render Django backend.

## GitHub

Push the repository to GitHub, including `frontend/package-lock.json`:

```powershell
git add .
git commit -m "Prepare Vercel and Render deployment"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

Do not commit `.env`, `db.sqlite3`, `media/`, `staticfiles/`, or `node_modules/`.

## Render backend

1. In Render, choose **New > Blueprint** and select the GitHub repository.
2. The Blueprint creates a **Free** web service. Set `DATABASE_URL` manually to a free PostgreSQL database from Neon or Supabase.
3. Set `ALLOWED_HOSTS` to the backend hostname, for example `shire-jama-api.onrender.com`.
4. Set `CORS_ALLOWED_ORIGINS` and `CSRF_TRUSTED_ORIGINS` to the final Vercel URL, for example `https://shire-jama.vercel.app`.
5. Deploy and open `/admin/` on the backend URL.
6. Create an administrator from the Render service shell:

```text
python manage.py createsuperuser
```

The Render build runs migrations and collects static files automatically.

The free Render web service sleeps after inactivity, so the first request after a quiet period may be slow. Its local filesystem is also ephemeral: do not store permanent uploads in `backend/media/`. Use Cloudinary, Cloudflare R2, or Amazon S3 for videos and PDFs. Render's free PostgreSQL availability and retention can change, so an external free PostgreSQL provider is safer for this setup.

## Vercel frontend

1. In Vercel, import the GitHub repository.
2. Set **Root Directory** to `frontend`.
3. Use `npm run build` as the build command.
4. Use `dist` as the output directory.
5. Add `VITE_API_URL=https://YOUR_RENDER_SERVICE.onrender.com/api`.
6. Deploy.

`frontend/vercel.json` keeps client-side routes working after refresh.

## Persistence requirements

The frontend sends account, course, material metadata, quiz, attempt, grading, and progress changes to the Django API. All devices must use the same deployed API and the API must use one shared persistent database. In production, `DATABASE_URL` is required and must not point to SQLite; the backend refuses to start without it so it cannot silently save records to an ephemeral local database. Run migrations against that database during deployment.

Uploaded PDFs, documents, and videos are files rather than database records. Render's local filesystem is ephemeral, so configure persistent object storage such as Cloudflare R2 or Amazon S3 before relying on uploaded files across deploys. Local development may continue to use SQLite and local media storage.