import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { getAppName } from "../appName";
export default function Login() {
  return _jsxs("div", {
    className: "login-screen",
    children: [
      _jsx("h1", { children: getAppName() }),
      _jsx("p", { children: "Get push notifications from your webhooks." }),
      _jsx("a", {
        href: "/auth/login",
        className: "btn",
        style: {
          display: "inline-block",
          textAlign: "center",
          textDecoration: "none",
        },
        children: "Login / Signup",
      }),
    ],
  });
}
