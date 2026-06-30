import inquirer from "inquirer";
import yargs from "yargs";
import { PortalUFRGS } from "./portal";
import { posthog } from "./posthog";
import { DEFAULT_OUTPUT_TARGET, DEFAULT_OUTPUT_TYPE } from "./types";

const studentCurriculumHandler = async (
  outputType = DEFAULT_OUTPUT_TYPE,
  outputTarget = DEFAULT_OUTPUT_TARGET
) => {
  const credentials = await inquirer.prompt([
    { message: "Número de matrícula", name: "studentId", type: "string" },
    { message: "Senha", name: "password", type: "password" },
  ]);

  const portal = new PortalUFRGS();

  const { studentId, password } = credentials;
  try {
    await portal.login(studentId, password, posthog);
    await portal.studentCurriculum(outputType, outputTarget, studentId, posthog);
  } catch (e) {
    posthog.captureException(e, studentId);
    console.error(e.message);
  } finally {
    await posthog.shutdown();
  }
};

export const cli = () => {
  const argv = yargs
    .scriptName("ufrgsjs")
    .usage("$0 <cmd> [args]")
    .command(
      "historico",
      "busca o histórico escolar do aluno",
      (yargs) => {},
      function (argv) {
        posthog.capture({
          distinctId: "anonymous",
          event: "command_run",
          properties: { command: "historico" },
        });
        studentCurriculumHandler();
      }
    )
    .option("formato", {
      alias: "f",
      description: "Tipo do formato de saída",
      type: "string",
      default: "table",
    })
    .option("arquivo", {
      alias: "o",
      description: "Tipo do formato de saída",
      type: "string",
    })
    .demandCommand(1, 1, "escolha um comando")
    .help().argv;
};
