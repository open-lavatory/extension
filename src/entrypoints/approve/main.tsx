import "../../ui/style.css";

import { render } from "solid-js/web";

import { App } from "./App.js";

const root = document.querySelector("#root");

if (root) render(() => <App />, root);
