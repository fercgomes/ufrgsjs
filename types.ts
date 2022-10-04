export interface StudentCredentials {
  studentId: string;
  password: string;
}

export type OutputType = "table" | "json" | "csv";
export const DEFAULT_OUTPUT_TYPE: OutputType = "table";

export type OutputTarget = "console" | "file";
export const DEFAULT_OUTPUT_TARGET: OutputTarget = "console";
