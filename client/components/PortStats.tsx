import { PortInfo } from "@shared/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Shield, AlertTriangle, CheckCircle, Circle } from "lucide-react";

interface PortStatsProps {
  ports: PortInfo[];
}

export function PortStats({ ports }: PortStatsProps) {
  const stats = {
    total: ports.length,
    listening: ports.filter(p => p.state === "LISTENING").length,
    established: ports.filter(p => p.state === "ESTABLISHED").length,
    timeWait: ports.filter(p => p.state === "TIME_WAIT").length,
    tcp: ports.filter(p => p.protocol === "tcp").length,
    udp: ports.filter(p => p.protocol === "udp").length,
    withProcess: ports.filter(p => p.pid && p.processName).length,
  };

  const statCards = [
    {
      title: "Total Ports",
      value: stats.total,
      icon: Activity,
      color: "text-foreground",
      bgColor: "bg-muted/20",
    },
    {
      title: "Listening",
      value: stats.listening,
      icon: Shield,
      color: "text-green-400",
      bgColor: "bg-green-900/20",
    },
    {
      title: "Established",
      value: stats.established,
      icon: CheckCircle,
      color: "text-blue-400",
      bgColor: "bg-blue-900/20",
    },
    {
      title: "Time Wait",
      value: stats.timeWait,
      icon: AlertTriangle,
      color: "text-yellow-400",
      bgColor: "bg-yellow-900/20",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {statCards.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card key={stat.title} className={stat.bgColor}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <Icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              {stat.title === "Total Ports" && (
                <div className="flex items-center space-x-4 mt-2 text-xs text-muted-foreground">
                  <div className="flex items-center space-x-1">
                    <Circle className="h-2 w-2 fill-blue-400 text-blue-400" />
                    <span>TCP: {stats.tcp}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Circle className="h-2 w-2 fill-purple-400 text-purple-400" />
                    <span>UDP: {stats.udp}</span>
                  </div>
                </div>
              )}
              {stat.title === "Listening" && stats.withProcess > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {stats.withProcess} with processes
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
