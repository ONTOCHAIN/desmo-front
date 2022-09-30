import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { MatPaginator } from '@angular/material/paginator';
import { MatTableDataSource } from '@angular/material/table';
import { BigNumber } from 'ethers';
import { Subscription, tap } from 'rxjs';
import { DesmoldSDKService } from 'src/app/services/desmold-sdk/desmold-sdk.service';

interface IQueryEvent {
  blockNumber: number;
  transactionHash: string;
  taskId: string;
  log: string;
}

@Component({
  selector: 'app-transaction-list-table',
  templateUrl: './query-list-table.component.html',
  styleUrls: ['./query-list-table.component.css'],
})
export class QueryListTableComponent implements AfterViewInit, OnDestroy {
  displayedColumns: string[] = ['blockNumber', 'txHash', 'taskId', 'log'];

  dataSource: MatTableDataSource<IQueryEvent>;
  private txList: IQueryEvent[] = [];
  loading = false;

  private subscriptions: Subscription;

  @ViewChild(MatPaginator)
  paginator!: MatPaginator;

  constructor(
    private desmold: DesmoldSDKService,
    private cd: ChangeDetectorRef
  ) {
    this.dataSource = new MatTableDataSource<IQueryEvent>(this.txList);
    this.subscriptions = new Subscription();
  }

  async ngAfterViewInit() {
    this.subscriptions.add(
      this.paginator.page
        .pipe(
          tap(() =>
            this.loadPage(this.paginator.pageIndex, this.paginator.pageSize)
          )
        )
        .subscribe()
    );

    this.loading = true;
    this.cd.detectChanges(); // Needed because we're in the AfterViewInit lifecycle hook!

    await this.getAllCompletedQueries();
    await this.loadPage(0, this.paginator.pageSize);

    this.loading = false;
    this.cd.detectChanges(); // Needed because we're in the AfterViewInit lifecycle hook!
  }

  private async getAllCompletedQueries(): Promise<void> {
    const contract = this.desmold.desmoContract['contract'];
    const queryFilter = contract.filters.QueryCompleted();
    const events = await contract.queryFilter(queryFilter);
    const queryCompletedEvents = events.map((event: any) => {
      const requestId = BigNumber.from(
        event.args['result'].requestID
      ).toNumber();
      const taskId = event.args['result'].taskID;
      const result = event.args['result'].result; // TODO: decode the result!
      return {
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
        taskId: taskId,
        log: `Query with request ID ${requestId} was executed with the following result: ${result}`,
      } as IQueryEvent;
    });

    // TODO: with the new contracts, this event will be generated by the Desmo contract!
    const contractHub = this.desmold.desmoHub['contract'];
    const queryFilterHub = contractHub.filters.RequestID();
    const eventsHub = await contractHub.queryFilter(queryFilterHub);
    const requestIdEvents = eventsHub.map((event: any) => {
      const requestId = BigNumber.from(event.args['requestID']).toNumber();
      return {
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
        taskId: '',
        log: `A new request ID was generated: ${requestId}`,
      } as IQueryEvent;
    });

    // Descending order: more recent events first!
    this.txList = queryCompletedEvents
      .concat(requestIdEvents)
      .sort((a: IQueryEvent, b: IQueryEvent) => b.blockNumber - a.blockNumber);
  }

  private async loadPage(pageIndex: number, pageSize: number) {
    this.dataSource.data = []; // Empties the table

    const start = pageIndex * pageSize;
    const stop = start + pageSize;

    // Show results in the table:
    this.dataSource.data = this.txList.slice(start, stop);
  }

  public get dataLength(): number {
    return this.txList.length;
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }
}
