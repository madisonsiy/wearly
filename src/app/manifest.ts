import type { MetadataRoute } from "next";

// Lets people add Wearly to their phone's home screen and open it like an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Wearly",
    short_name: "Wearly",
    description: "What to wear today, with the clothes you already own.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f7fb",
    theme_color: "#1f6feb",
    icons: [],
  };
}
