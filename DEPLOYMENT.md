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

The free Render web service sleeps after inactivity, so the first request after a quiet period may be slow. Its local filesystem is also ephemeral: do not store permanent uploads in `backend/media/`. Set the `AWS_STORAGE_BUCKET_NAME` (and related `AWS_*`) environment variables described below to move uploads to durable object storage before relying on them across deploys. Render's free PostgreSQL availability and retention can change, so an external free PostgreSQL provider is safer for this setup.

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

Uploaded PDFs, documents, and videos are files rather than database records. Render's local filesystem is ephemeral, so configure persistent object storage before relying on uploaded files across deploys. Local development may continue to use SQLite and local media storage.

## Durable media storage (S3-compatible)

The backend supports any S3-compatible object store (Amazon S3, Cloudflare R2, Backblaze B2, DigitalOcean Spaces, MinIO, ...) via `django-storages`. It is optional: with no bucket configured, uploads fall back to local disk exactly as before (fine for local development; **not** safe for production on Render, since that disk is wiped on every redeploy/restart — the backend logs a `RuntimeWarning` on startup if it detects this in production).

To enable it, set in the Render service's environment:

| Variable | Required | Notes |
|---|---|---|
| `AWS_STORAGE_BUCKET_NAME` | Yes | Enables object storage; bucket must already exist. |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Yes | Credentials with read/write access to the bucket. |
| `AWS_S3_REGION_NAME` | No | Defaults to `auto` (works for R2); set a real AWS region for S3. |
| `AWS_S3_ENDPOINT_URL` | Only for non-AWS providers | e.g. `https://<account_id>.r2.cloudflarestorage.com` for Cloudflare R2. Leave unset for AWS S3. |
| `AWS_S3_CUSTOM_DOMAIN` | No | A public CDN/custom domain to serve files from instead of signed URLs. |
| `AWS_QUERYSTRING_EXPIRE` | No | Seconds a signed file URL stays valid. Defaults to 3600. |

Uploaded files still go through the `/api/materials/<id>/stream/` endpoint so access control (role and academic-level checks) is enforced before a student or instructor ever receives a file URL; when object storage is active, that endpoint redirects to a short-lived signed URL instead of proxying bytes through Django, so video scrubbing (HTTP range requests) is served directly by the object store.