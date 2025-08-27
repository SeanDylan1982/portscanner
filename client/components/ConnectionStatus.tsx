import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Wifi, WifiOff, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConnectionStatusProps {
  connected: boolean;
  lastUpdate: Date | null;
}

export function ConnectionStatus({
  connected,
  lastUpdate,
}: ConnectionStatusProps) {
  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) {
      // Less than 1 minute
      return `${Math.floor(diff / 1000)}s ago`;
    } else if (diff < 3600000) {
      // Less than 1 hour
      return `${Math.floor(diff / 60000)}m ago`;
    } else {
      return date.toLocaleTimeString();
    }
  };

  return (
    <div className="flex items-center space-x-3">
      {/* WebSocket Status */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant={connected ? "default" : "destructive"}
            className={cn(
              "flex items-center space-x-1",
              connected
                ? "bg-green-900/20 text-green-400 border-green-900/30 hover:bg-green-900/30"
                : "bg-red-900/20 text-red-400 border-red-900/30",
            )}
          >
            {connected ? (
              <Wifi className="h-3 w-3" />
            ) : (
              <WifiOff className="h-3 w-3" />
            )}
            <span className="text-xs">
              {connected ? "Live" : "Disconnected"}
            </span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>{connected ? "Auto-refresh enabled" : "Auto-refresh disabled"}</p>
        </TooltipContent>
      </Tooltip>

      {/* Last Update */}
      {lastUpdate && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center space-x-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>{formatTime(lastUpdate)}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Last updated: {lastUpdate.toLocaleString()}</p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
