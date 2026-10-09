import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0b",
          borderRadius: 14,
        }}
      >
        <div
          style={{
            width: "56%",
            height: "56%",
            borderRadius: "50%",
            background: "radial-gradient(circle at 38% 35%, #fff0a3, #ffd60a 45%, #6b6d73 100%)",
            boxShadow: "0 0 10px rgba(255,214,10,0.55)",
          }}
        />
      </div>
    ),
    size,
  );
}
