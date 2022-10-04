import Axios, { AxiosInstance } from "axios";
import * as cheerio from "cheerio";
import FormData from "form-data";
import Fuse from "fuse.js";
import puppeteer from "puppeteer";
import { PORTAL_UFRGS_BASE_URL, PORTAL_UFRGS_LOGIN_URL } from "./constants";
import { OutputTarget, OutputType } from "./types";

export class PortalUFRGS {
  private token?: string;
  private axios: AxiosInstance;

  constructor() {
    this.axios = Axios.create({
      baseURL: PORTAL_UFRGS_BASE_URL,
    });
  }

  public async login(username: string, password: string) {
    console.log("Logando no Portal do Aluno");

    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    await page.goto(PORTAL_UFRGS_LOGIN_URL, { waitUntil: "networkidle0" });

    await page.type("#usuario", username);
    await page.type("#senha", password);

    await Promise.all([
      page.click("input[name='login']"),
      page.waitForNavigation({ waitUntil: "networkidle0" }),
    ]);

    const cookies = await page.cookies();
    await browser.close();

    let token: string | undefined = undefined;
    if (cookies) {
      token = cookies.find((cookie) => cookie.name === "PHPSESSID").value;
    }

    if (token) {
      this.token = token;
    } else {
      throw new Error("Credenciais incorretas");
    }
  }

  public isReady() {
    return !!this.token;
  }

  public async studentCurriculum(
    outputType: OutputType,
    outputTarget: OutputTarget
  ) {
    const URL = "/especial/index.php?cods=1,1,2,4";

    if (this.isReady()) {
      const page = await this.axios
        .get(URL, {
          headers: { Cookie: `PHPSESSID=${this.token}` },
        })
        .then((res) => res.data);

      const $ = cheerio.load(page);
      const table = $("body table.modelo1  tbody  tr");
      const rows: any = [];
      table.each((index, elem) => {
        if (index === 0) return true;

        const tds = $(elem).find("td");

        const periodoLetivo = $(tds[0]).text().trim();
        const disciplina = $(tds[1]).text().trim();
        const conceito = $(tds[2]).text().trim();
        const situacao = $(tds[3]).text().trim();
        const creditos = $(tds[4]).text().trim();

        const disciplinaNameMatch = disciplina.match(/\[(.*)\]\ (.*)/);
        let courseName, courseCode;
        if (disciplinaNameMatch && disciplinaNameMatch.length === 6) {
          courseCode = disciplinaNameMatch[1];
          courseName = disciplinaNameMatch[2];
        }

        console.log(periodoLetivo);
        const match = periodoLetivo.match(/[0-9]{4}\/[0-9]{1}/);

        if (match)
          rows.push({
            periodoLetivo,
            courseCode,
            courseName,
            conceito,
            situacao,
            creditos,
          });
      });

      // Check output format
      switch (outputType) {
        case "table":
          if (outputTarget === "console") {
            console.table(rows, ["Semestre", "Nome"]);
          }

          break;

        case "csv":
          console.error("Não implementado");
          break;

        case "json":
          console.error("Não implementado");
          break;
      }
    } else {
      throw new Error("Not logged in.");
    }
  }

  public async getHorarios() {
    if (this.isReady()) {
      const formData = new FormData();
      formData.append("selecionado", "38/1");

      const page = await this.axios
        .post("/intranet/portal/public/index.php?cods=1,1,2,7", formData, {
          headers: {
            ...formData.getHeaders(),
            Cookie: `PHPSESSID=${this.token}`,
          },
        })
        .then((res) => res.data);

      const $ = cheerio.load(page, { decodeEntities: false });
      const table = $("#Horarios");
      const rows = table.find("tr.modelo1odd, tr.modelo1even");

      let currentCode = null;
      let tempActivity: any = {};
      let activies: any = {};

      rows.each((index, elem) => {
        const tds = $(elem).find("td");
        const ativide = $(tds[0]).text().trim();
        const credits = $(tds[1]).text().trim();
        const classId = $(tds[2]).text().trim();
        const oferecidasVets = $(tds[3]).text().trim();
        const oferecidaCalouros = $(tds[4]).text().trim();
        const vagasAmpl = $(tds[5]).text().trim();
        const ocupVet = $(tds[6]).text().trim();
        const ocupCal = $(tds[7]).text().trim();
        const horarios = $(tds[8]).text().trim();
        const professors = $(tds[9]).text().trim();

        const atividadeMatch = ativide.match(/\((.*)\)(.*)/);
        let name = null,
          code = null;
        if (atividadeMatch) {
          code = atividadeMatch[1].trim();
          name = atividadeMatch[2].trim();
        }

        let professorsList = [];
        $(tds[9])
          .find(".hor")
          .each((index, elem) => {
            const professorNameAll = $(elem).text().trim();
            const match = professorNameAll.match(/(.*?)\-.*/);
            if (match) {
              const professorName = match[1].trim().toUpperCase();

              // try to search on cic list
              const opts: Fuse.IFuseOptions<any> = {
                keys: ["name"],
                isCaseSensitive: false,
                threshold: 0.1,
              };

              professorsList.push({ name: professorName });
            }
          });

        console.log("Professores", professorsList);

        let scheduleList = {};

        $(tds[8])
          .find(".hor")
          .each((index, elem) => {
            const text = $(elem).text().trim();
            const match = text.match(/(.*)\ (.*)\-(.*)\ (.*)/);

            if (match) {
              const day = match[1];
              const startTime = match[2];
              const endTime = match[3];

              console.log(day, startTime, endTime);
              scheduleList = {
                ...scheduleList,
                [day]: {
                  startTime,
                  endTime,
                },
              };
            }
          });

        if (code && code !== currentCode && tempActivity != {}) {
          activies = {
            ...activies,
            [currentCode]: tempActivity,
          };
        }

        if (code) {
          currentCode = code;
          // start new activity
          tempActivity = {
            code: code,
            name: name,
            credits: credits,
            offers: {
              [classId]: {
                oferecidasVets,
                oferecidaCalouros,
                vagasAmpl,
                ocupVet,
                ocupCal,
                schedule: scheduleList,
                professors: professorsList,
              },
            },
          };
        } else {
          // add a new class for current code
          tempActivity = {
            ...tempActivity,
            offers: {
              ...tempActivity.offers,
              [classId]: {
                oferecidasVets,
                oferecidaCalouros,
                vagasAmpl,
                ocupVet,
                ocupCal,
                schedule: scheduleList,
                professors: professorsList,
              },
            },
          };
        }

        // console.log(name, code);
        // console.log(horarios);
      });
    } else {
      throw new Error("Not logged in.");
    }
  }
}
