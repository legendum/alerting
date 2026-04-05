import { getAppName } from "../appName";

export default function Login() {
  return (
    <div className="login-screen">
      <h1>{getAppName()}</h1>
      <p>Get push notifications from your webhooks.</p>
      <a
        href="/auth/login"
        className="btn"
        style={{
          display: "inline-block",
          textAlign: "center",
          textDecoration: "none",
        }}
      >
        Login with Legendum
      </a>
    </div>
  );
}
