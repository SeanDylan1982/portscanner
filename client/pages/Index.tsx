import { useEffect, useState, useCallback } from "react";
import { PortInfo, PortsResponse, PortUpdateMessage } from "@shared/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PortTable } from "@/components/PortTable";
import { PortStats } from "@/components/PortStats";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import { Search, RefreshCw, Activity, Server, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Index() {
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [filteredPorts, setFilteredPorts] = useState<PortInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [protocolFilter, setProtocolFilter] = useState<string>("all");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Auto-refresh with polling (temporary replacement for WebSocket)
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchPorts();
    }, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, [autoRefresh]);


  // Initial port data fetch
  const fetchPorts = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/ports');
      if (!response.ok) {
        throw new Error('Failed to fetch ports');
      }
      
      const data: PortsResponse = await response.json();
      setPorts(data.ports);
      setLastUpdate(new Date(data.timestamp));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPorts();
  }, []);

  // Filter ports based on search and filters
  useEffect(() => {
    let filtered = ports;

    // Protocol filter
    if (protocolFilter !== "all") {
      filtered = filtered.filter(port => port.protocol === protocolFilter);
    }

    // State filter
    if (stateFilter !== "all") {
      filtered = filtered.filter(port => port.state === stateFilter);
    }

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(port => 
        port.port.toString().includes(term) ||
        port.processName?.toLowerCase().includes(term) ||
        port.address.toLowerCase().includes(term) ||
        port.state.toLowerCase().includes(term)
      );
    }

    setFilteredPorts(filtered);
  }, [ports, searchTerm, protocolFilter, stateFilter]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">Loading port information...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">{error}</p>
            <Button onClick={fetchPorts} className="w-full">
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2">
                <Server className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">Port Manager</h1>
              </div>
              <Badge variant="outline" className="ml-4">
                <Activity className="h-3 w-3 mr-1" />
                Dev Tool
              </Badge>
            </div>
            
            <div className="flex items-center space-x-4">
              <ConnectionStatus connected={autoRefresh} lastUpdate={lastUpdate} />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={autoRefresh ? "bg-green-900/20 text-green-400 border-green-900/30" : ""}
              >
                <Activity className="h-4 w-4 mr-2" />
                {autoRefresh ? "Auto Refresh On" : "Auto Refresh Off"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchPorts}
                disabled={loading}
              >
                <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Stats Cards */}
        <PortStats ports={ports} />

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Search className="h-5 w-5" />
              <span>Filter & Search</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Search</label>
                <Input
                  placeholder="Search ports, processes, addresses..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Protocol</label>
                <Select value={protocolFilter} onValueChange={setProtocolFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Protocols</SelectItem>
                    <SelectItem value="tcp">TCP</SelectItem>
                    <SelectItem value="udp">UDP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">State</label>
                <Select value={stateFilter} onValueChange={setStateFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All States</SelectItem>
                    <SelectItem value="LISTENING">Listening</SelectItem>
                    <SelectItem value="ESTABLISHED">Established</SelectItem>
                    <SelectItem value="TIME_WAIT">Time Wait</SelectItem>
                    <SelectItem value="CLOSE_WAIT">Close Wait</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Port Table */}
        <PortTable ports={filteredPorts} onRefresh={fetchPorts} />
      </main>
    </div>
  );
}
