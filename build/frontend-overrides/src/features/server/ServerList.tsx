import { useCallback, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { gql, useQuery, useApolloClient } from "@apollo/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { GET_SERVERS_QUERY } from "../../queries/server";
import Error from "../layout/Error";
import Paginator from "../Paginator";
import useQueryParams from "../../hooks/useQueryParams";
import { useAtom } from "jotai";
import serverLimitAtom from "../../atoms/server/limit";
import { useModal } from "../../atoms/modal";
import PageHeader from "../ui/PageHeader";
import ServerRow from "./ServerRow";

const SERVER_METRIC_SUBSCRIPTION = gql`
subscription ServerMetric {
  serverMetric {
    cpuUtilPct
    fsRootUsedPct
    load15m
    load1m
    load5m
    memUsedPct
    netRxBps
    netTxBps
    serverId
    swapUsedPct
    time
    isOnline
  }
}
`;

interface MetricData {
  serverId: number;
  cpuUtilPct?: number;
  memUsedPct?: number;
  netRxBps?: number;
  netTxBps?: number;
  isOnline?: boolean;
  time?: string;
  [key: string]: unknown;
}

const ServerList = () => {
  const { t } = useTranslation();
  const { open } = useModal();
  const [atomLimit, setAtomLimit] = useAtom(serverLimitAtom);
  const [limit, offset, setQueryLimit, setOffset] = useQueryParams([
    {
      name: "limit",
      defaultValue: atomLimit,
      isNumeric: true,
      replace: false,
    },
    {
      name: "offset",
      defaultValue: 0,
      isNumeric: true,
      replace: false,
    },
  ]);
  const client = useApolloClient();
  const [metricsMap, setMetricsMap] = useState<Record<number, MetricData>>({});
  useEffect(() => {
    const observable = client.subscribe({ query: SERVER_METRIC_SUBSCRIPTION });
    const sub = observable.subscribe({
      next({ data }: { data?: { serverMetric?: MetricData } }) {
        if (data?.serverMetric) {
          const m = data.serverMetric;
          setMetricsMap((prev) => {
            if (prev[m.serverId] === m) return prev;
            return { ...prev, [m.serverId]: m };
          });
        }
      },
    });
    return () => sub.unsubscribe();
  }, [client]);
  const { data, loading, error, refetch } = useQuery(
    GET_SERVERS_QUERY,
    { variables: { limit, offset } }
  );

  const setLimit = useCallback((value: number) => {
    setAtomLimit(value);
    setQueryLimit(value);
  }, [setAtomLimit, setQueryLimit]);

  const servers = data?.paginatedServers?.items ?? [];
  const count = data?.paginatedServers?.count ?? 0;

  if (error) return <Error error={error} />;

  return (
    <>
      <p className="aurora-eyebrow">{t("Server overview")}</p>
      <p className="mb-5 text-sm text-muted-foreground">{t("Track resource usage and manage server connections")}</p>
      <PageHeader
        title="Servers"
        onAdd={async () => {
          const result = await open("serverInfo");
          if (result) refetch();
        }}
      />

      <div className="my-5 grid grid-cols-1 gap-3 sm:grid-cols-3">{[[t("Registered servers"), count], [t("Displayed servers"), servers.length], [t("Online now"), servers.filter((s: {id:number}) => metricsMap[s.id]?.isOnline).length]].map(([label, value]) => <div key={String(label)} className="aurora-panel p-5"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p></div>)}</div>
      <div className="aurora-panel overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : servers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <h2 className="text-lg font-bold tracking-tight">{t("No servers yet")}</h2>
            <p className="mt-1.5 max-w-xs text-center text-sm text-muted-foreground">
              {t("Add a server to get started.")}
            </p>
            <Button
              variant="default"
              size="sm"
              className="mt-6"
              onClick={async () => {
                const result = await open("serverInfo");
                if (result) refetch();
              }}
            >
              {t("Add Server")}
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Name")}</TableHead>
                <TableHead className="text-center">{t("SSH")}</TableHead>
                <TableHead className="text-center">{t("Ports")}</TableHead>
                <TableHead className="text-center">{t("Traffic")}</TableHead>
                <TableHead className="text-center">{t("CPU")}</TableHead>
                <TableHead className="text-center">{t("Mem")}</TableHead>
                <TableHead className="text-center">{t("Disk")}</TableHead>
                <TableHead className="text-right">{t("Actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {servers.map((server: { id: number; [key: string]: unknown }) => (
                <ServerRow
                  key={server.id}
                  server={server as any}
                  refetch={refetch}
                  metric={metricsMap[server.id]}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {servers.length > 0 && (
        <Paginator
          isLoading={loading}
          count={count}
          limit={limit}
          offset={offset}
          setLimit={setLimit}
          setOffset={setOffset}
        />
      )}
    </>
  );
};

export default ServerList;
