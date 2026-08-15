# El Galpón Creativo

App de briefs e ideas para la agencia, conectada a Supabase.

## Subir a GitHub (sin usar la terminal)

1. Entra a github.com → **New repository** → nómbralo `galpon-creativo` → **Create repository**.
2. En la página del repo vacío, haz clic en **"uploading an existing file"**.
3. Arrastra TODA la carpeta `galpon-creativo` (todos los archivos y la carpeta `src`) a esa página.
4. Dale **Commit changes**.

## Conectar a Vercel

1. Entra a vercel.com → **Add New → Project**.
2. Elige el repositorio `galpon-creativo` que acabas de subir → **Import**.
3. En **Environment Variables**, agrega estas dos (los valores están en `.env.example`):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Dale **Deploy**.
5. En 1-2 minutos te da un link tipo `galpon-creativo.vercel.app` — ese es el definitivo, sin marca de Claude.

## Notas

- Cada persona del equipo crea su propia cuenta (correo + contraseña) la primera vez.
- El primer inicio de sesión les pide nombre y rol — eso queda guardado en la tabla `profiles`.
- Los roles válidos son: `admin`, `director`, `equipo`.
