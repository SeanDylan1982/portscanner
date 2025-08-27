import { useState } from "react";
import { PortInfo, ProcessOperationResponse } from "@shared/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Network, Trash2, RotateCcw, Info, ExternalLink, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface PortTableProps {
  ports: PortInfo[];
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export function PortTable({ ports, onRefresh }: PortTableProps) {
  const [killingPorts, setKillingPorts] = useState<Set<number>>(new Set());
  const [selectedPort, setSelectedPort] = useState<PortInfo | null>(null);

  const getStateColor = (state: string) => {
    switch (state) {
      case "LISTENING":
        return "port-listening";
      case "ESTABLISHED":
        return "port-established";
      case "TIME_WAIT":
        return "port-time-wait";
      case "CLOSED":
        return "port-closed";
      default:
        return "port-unknown";
    }
  };

  const getProtocolIcon = (protocol: string) => {
    return protocol === "tcp" ? "🔵" : "🟣";
  };

  const handleKillProcess = async (port: PortInfo) => {
    if (!port.pid) {
      toast({
        title: "Cannot kill process",
        description: "No process ID available for this port",
        variant: "destructive",
      });
      return;
    }

    setKillingPorts(prev => new Set([...prev, port.port]));

    try {
      const response = await fetch('/api/ports/kill', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pid: port.pid,
          port: port.port,
        }),
      });

      const result: ProcessOperationResponse = await response.json();

      if (result.success) {
        toast({
          title: "Process killed",
          description: `Successfully killed process ${port.pid} on port ${port.port}`,
        });
        // Refresh the port list after a short delay
        setTimeout(onRefresh, 1000);
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      toast({
        title: "Failed to kill process",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setKillingPorts(prev => {
        const newSet = new Set(prev);
        newSet.delete(port.port);
        return newSet;
      });
    }
  };

  const formatAddress = (address: string) => {
    if (address === "0.0.0.0" || address === "::") {
      return "All interfaces";
    }
    if (address === "127.0.0.1" || address === "::1") {
      return "Localhost";
    }
    return address;
  };

  if (ports.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Network className="h-5 w-5" />
            <span>Active Ports</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Network className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No ports found matching your criteria</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Network className="h-5 w-5" />
            <span>Active Ports</span>
            <Badge variant="outline">{ports.length} ports</Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Port</TableHead>
                <TableHead>Protocol</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Process</TableHead>
                <TableHead>PID</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ports.map((port, index) => (
                <TableRow key={`${port.port}-${port.protocol}-${port.address}-${index}`}>
                  <TableCell className="font-mono font-medium">
                    {port.port}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      <span className="text-lg">{getProtocolIcon(port.protocol)}</span>
                      <span className="font-mono text-sm uppercase">
                        {port.protocol}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={cn("port-status-badge", getStateColor(port.state))}>
                      {port.state}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>{formatAddress(port.address)}</span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Full address: {port.address}</p>
                        {port.foreignAddress && (
                          <p>Foreign: {port.foreignAddress}</p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    {port.processName ? (
                      <div className="space-y-1">
                        <div className="font-medium text-sm">{port.processName}</div>
                        {port.processPath && (
                          <div className="text-xs text-muted-foreground font-mono truncate max-w-[200px]">
                            {port.processPath}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono">
                    {port.pid ? (
                      <Badge variant="outline" className="text-xs">
                        {port.pid}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end space-x-2">
                      {/* Port Details */}
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedPort(port)}
                          >
                            <Info className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Port {port.port} Details</DialogTitle>
                            <DialogDescription>
                              Detailed information about this port
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="text-sm font-medium">Port</label>
                                <p className="font-mono">{port.port}</p>
                              </div>
                              <div>
                                <label className="text-sm font-medium">Protocol</label>
                                <p className="font-mono uppercase">{port.protocol}</p>
                              </div>
                              <div>
                                <label className="text-sm font-medium">State</label>
                                <Badge className={cn("port-status-badge", getStateColor(port.state))}>
                                  {port.state}
                                </Badge>
                              </div>
                              <div>
                                <label className="text-sm font-medium">Address</label>
                                <p className="font-mono text-sm">{port.address}</p>
                              </div>
                              {port.foreignAddress && (
                                <div className="col-span-2">
                                  <label className="text-sm font-medium">Foreign Address</label>
                                  <p className="font-mono text-sm">{port.foreignAddress}</p>
                                </div>
                              )}
                              {port.pid && (
                                <div>
                                  <label className="text-sm font-medium">Process ID</label>
                                  <p className="font-mono">{port.pid}</p>
                                </div>
                              )}
                              {port.processName && (
                                <div>
                                  <label className="text-sm font-medium">Process Name</label>
                                  <p>{port.processName}</p>
                                </div>
                              )}
                              {port.processPath && (
                                <div className="col-span-2">
                                  <label className="text-sm font-medium">Process Path</label>
                                  <p className="font-mono text-sm break-all">{port.processPath}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>

                      {/* Kill Process */}
                      {port.pid && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              disabled={killingPorts.has(port.port)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Kill Process</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to kill the process (PID: {port.pid}) 
                                running on port {port.port}? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleKillProcess(port)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Kill Process
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
