import http from "http";
import { app } from "./app";
const port = Number(process.env.PORT || 3000);
http.createServer(app).listen(port, () => {
  console.log(`Server is started on port ${port}`);
}).on("error", (error) => { console.error(error); process.exitCode = 1; });
