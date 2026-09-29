# iLogoKids

iLogoKids is a web-based visual 2D map of social connections within a school. Users join through invitations rather than open self-registration. The planned MVP will later include a visual connection map, privacy controls and 1:1 realtime messaging.

## Local development

Install dependencies in the client and server folders, then start both development servers from the project root:

```sh
npm install
npm --prefix client install
npm --prefix server install
npm run dev
```

The frontend runs at <http://localhost:5173> and proxies `/api` requests to the server at <http://localhost:3000>. Check the API at <http://localhost:3000/api/health>.

Build both applications with:

```sh
npm run build
```

Run the production server after building with `npm --prefix server start`.
