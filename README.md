# API de ejemplo con Express y Amazon RDS

API mínima en Node.js con Express y `mysql2` que se conecta a una base MySQL en Amazon RDS. Sirve para practicar la publicación en una instancia EC2 con Docker.

## Rutas

| Ruta | Qué devuelve |
|---|---|
| `GET /` | Lista de rutas |
| `GET /api/health` | `200` si la base responde; `503` con el error y una pista si no |
| `GET /api/servidor` | Versión de MySQL, zona horaria, hora local y UTC, `sql_mode` |
| `GET /api/tablas` | Tablas de la base con su número exacto de filas |
| `GET /api/tablas/:nombre` | Columnas y total de filas de una tabla (`400` si el nombre no es válido, `404` si no existe) |
| `GET /api/tablas/:nombre/muestra?limite=5` | Primeras filas de una tabla (`limite` entre 1 y 50) |

## Archivos

```
api-express/
├── app.js           rutas
├── db.js            conexión a RDS con variables de entorno
├── server.js        arranque: app.listen() en el puerto 3000
├── package.json
├── package-lock.json
├── Dockerfile
├── .dockerignore
├── .gitignore       excluye .env y node_modules
└── .env.example     plantilla de las variables
```

## Variables de entorno

Copie `.env.example` como `.env` y complete los valores. `.env` nunca se sube a GitHub.

| Variable | Valor |
|---|---|
| `DB_HOST` | Punto de enlace de la instancia RDS |
| `DB_PORT` | `3306` |
| `DB_USER`, `DB_PASSWORD` | Usuario de MySQL para la API |
| `DB_NAME` | Base a consultar (predeterminada: `dw_ventas`) |
| `PORT` | Puerto de la API (predeterminado: `3000`) |
| `DB_SSL` | Solo para un MySQL local sin TLS: `false` |

## 1. Probar en su equipo

```bash
npm install
cp .env.example .env      # en PowerShell: copy .env.example .env
node server.js
```

Abra `http://localhost:3000/api/health`.

## 2. Subir a GitHub

```bash
git init
git add .
git commit -m "API de ejemplo"
git branch -M main
git remote add origin https://github.com/USUARIO/api-express.git
git push -u origin main
```

## 3. Publicar en EC2 con Docker

En el grupo de seguridad de la instancia agregue una regla de entrada TCP `3000` desde `0.0.0.0/0`. El grupo de seguridad de RDS debe permitir el puerto `3306`.

Conéctese con EC2 Instance Connect e instale Docker y Git. Al terminar, cierre la terminal y conéctese de nuevo para que el permiso de Docker tenga efecto:

```bash
sudo dnf install -y docker git nano
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user
exit
```

Clone el repositorio, cree el `.env` y levante el contenedor. Si el repositorio es privado, GitHub pide su usuario y un token personal como contraseña.

```bash
git clone https://github.com/USUARIO/api-express.git
cd api-express
cp .env.example .env
nano .env
docker build -t api-express .
docker run -d --name api-express --restart unless-stopped -p 3000:3000 --env-file .env api-express
docker logs api-express
```

Pruebe `http://IP-PÚBLICA:3000/api/health` desde su navegador.

## Publicar cambios

```bash
git pull
docker rm -f api-express
docker build -t api-express .
docker run -d --name api-express --restart unless-stopped -p 3000:3000 --env-file .env api-express
```

## Alternativa: publicar con Docker Hub

La imagen se construye en su equipo y se sube a Docker Hub. La EC2 solo la descarga: no necesita Git, ni el código, ni construir la imagen.

> **Antes de construir:** el archivo `.dockerignore` debe contener la línea `.env`. Si no la tiene, el `.env` con la contraseña de RDS queda dentro de la imagen y cualquiera que la descargue puede leerlo. Las credenciales entran solo al correr el contenedor, con `--env-file`.

### En su equipo

Cree una cuenta en [hub.docker.com](https://hub.docker.com) e inicie sesión desde la terminal con su usuario y un token de acceso personal como contraseña (en Docker Hub: **Account settings → Personal access tokens**):

```bash
docker login
```

Construya la imagen para la arquitectura de la EC2 (x86, como `t3.micro`) y súbala. Cambie `USUARIO` por su usuario de Docker Hub:

```bash
docker build --platform linux/amd64 -t USUARIO/api-express .
docker push USUARIO/api-express
```

La imagen queda pública. Si la marca como privada en Docker Hub, la EC2 también tiene que ejecutar `docker login` antes de descargarla.

### En la EC2

Instale Docker. Al terminar, cierre la terminal y conéctese de nuevo para que el permiso de Docker tenga efecto:

```bash
sudo dnf install -y docker nano
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user
exit
```

Cree el `.env` con `nano .env`, pegue las variables de la sección **Variables de entorno** y guarde con `Ctrl+O`, `Enter` y `Ctrl+X`. Luego levante el contenedor:

```bash
docker run -d --name api-express --restart unless-stopped -p 3000:3000 --env-file .env USUARIO/api-express
docker logs api-express
```

Pruebe `http://IP-PÚBLICA:3000/api/health` desde su navegador.

### Publicar cambios

En su equipo:

```bash
docker build --platform linux/amd64 -t USUARIO/api-express .
docker push USUARIO/api-express
```

En la EC2:

```bash
docker pull USUARIO/api-express
docker rm -f api-express
docker run -d --name api-express --restart unless-stopped -p 3000:3000 --env-file .env USUARIO/api-express
```

## Si `/api/health` responde 503

La respuesta trae el código del error y una pista:

| Código | Causa probable |
|---|---|
| `ETIMEDOUT` | RDS no es de acceso público o su grupo de seguridad no permite el puerto 3306 |
| `ENOTFOUND` | `DB_HOST` mal escrito |
| `ER_ACCESS_DENIED_ERROR` | Usuario o contraseña incorrectos |
| `ER_BAD_DB_ERROR` | La base de `DB_NAME` no existe |

En el `.env` no ponga comillas alrededor de los valores: `docker --env-file` las toma como parte del valor.
