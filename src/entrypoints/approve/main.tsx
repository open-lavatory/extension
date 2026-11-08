import "../../ui/style.css";

import { render } from "solid-js/web";

import { language } from "../../i18n/catalogue.js";
import { App } from "./App.js";

const root = document.querySelector("#root");

document.documentElement.lang = language;

if (root) render(() => <App />, root);
