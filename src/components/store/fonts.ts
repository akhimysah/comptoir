import { Cormorant_Garamond, DM_Sans, Fraunces, Manrope, Syne } from "next/font/google";

const dmsans = DM_Sans({ subsets: ["latin"], variable: "--f-dmsans" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--f-fraunces" });
const syne = Syne({ subsets: ["latin"], variable: "--f-syne" });
const manrope = Manrope({ subsets: ["latin"], variable: "--f-manrope" });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], variable: "--f-cormorant", weight: ["500", "600", "700"] });

/** Classes qui rendent disponibles toutes les polices de thème. */
export const storeFontVars = [dmsans, fraunces, syne, manrope, cormorant].map((f) => f.variable).join(" ");
