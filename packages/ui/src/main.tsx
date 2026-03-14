import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import App from "./App"
import { WebSocketProvider } from "./contexts/WebSocketContext"
import { BackendProvider } from "./contexts/BackendContext"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="dark">
      <TooltipProvider>
        <WebSocketProvider>
          <BackendProvider>
            <App />
          </BackendProvider>
        </WebSocketProvider>
      </TooltipProvider>
    </ThemeProvider>
  </StrictMode>,
)
