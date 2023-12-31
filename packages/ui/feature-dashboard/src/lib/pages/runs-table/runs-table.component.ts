import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  ViewChild,
} from '@angular/core';
import {
  ApEdition,
  ExecutionOutputStatus,
  FlowRerunStrategy,
  FlowRun,
  NotificationStatus,
  SeekPage,
} from '@activepieces/shared';
import { ActivatedRoute, Router } from '@angular/router';
import { distinctUntilChanged, map, Observable, switchMap, tap } from 'rxjs';
import { RunsTableDataSource } from './runs-table.datasource';
import {
  InstanceRunService,
  ApPaginatorComponent,
  FlagService,
  ProjectSelectors,
  ProjectActions,
  NavigationService,
} from '@activepieces/ui/common';
import { FormControl } from '@angular/forms';
import { Store } from '@ngrx/store';
import { RunsService } from './runs.service';

@Component({
  templateUrl: './runs-table.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RunsTableComponent implements OnInit {
  @ViewChild(ApPaginatorComponent, { static: true })
  paginator!: ApPaginatorComponent;
  runsPage$: Observable<SeekPage<FlowRun>>;
  nonCommunityEdition$: Observable<boolean>;
  toggleNotificationFormControl: FormControl<boolean> = new FormControl();
  dataSource!: RunsTableDataSource;
  displayedColumns = ['flowName', 'status', 'started', 'finished'];
  updateNotificationsValue$: Observable<boolean>;
  selectedStatus: FormControl<ExecutionOutputStatus | undefined> =
    new FormControl();
  changeRunStatus$: Observable<void>;
  readonly ExecutionOutputStatus = ExecutionOutputStatus;
  FlowRerunStrategy: typeof FlowRerunStrategy = FlowRerunStrategy;
  flowRerunOptions = [
    {
      label: 'Rerun Entire Flow',
      strategy: FlowRerunStrategy.FROM_START,
      color: 'secondary',
      icon: 'loop',
    },
    {
      label: 'Rerun From Failed',
      strategy: FlowRerunStrategy.FROM_FAILED_STEP,
      color: 'secondary',
      icon: 'replay',
    },
  ];

  constructor(
    private router: Router,
    private activatedRoute: ActivatedRoute,
    private flagsService: FlagService,
    private store: Store,
    private instanceRunService: InstanceRunService,
    private navigationService: NavigationService,
    private runsService: RunsService
  ) {}

  ngOnInit(): void {
    this.changeRunStatus$ = this.selectedStatus.valueChanges.pipe(
      distinctUntilChanged(),
      tap((status) => {
        this.router.navigate(['runs'], {
          queryParams: {
            status:
              status && status in ExecutionOutputStatus ? status : undefined,
          },
        });
      }),
      map(() => undefined)
    );
    this.nonCommunityEdition$ = this.flagsService
      .getEdition()
      .pipe(map((res) => res !== ApEdition.COMMUNITY));
    this.updateNotificationsValue$ = this.store
      .select(ProjectSelectors.selectIsNotificationsEnabled)
      .pipe(
        tap((enabled) => {
          this.toggleNotificationFormControl.setValue(enabled);
        }),
        switchMap(() =>
          this.toggleNotificationFormControl.valueChanges.pipe(
            distinctUntilChanged(),
            tap((value) => {
              this.store.dispatch(
                ProjectActions.updateProject({
                  notifyStatus: value
                    ? NotificationStatus.ALWAYS
                    : NotificationStatus.NEVER,
                })
              );
            })
          )
        )
      );
    this.dataSource = new RunsTableDataSource(
      this.activatedRoute.queryParams,
      this.paginator,
      this.store,
      this.instanceRunService
    );
  }

  openInstanceRun(run: FlowRun, event: MouseEvent) {
    const route = '/runs/' + run.id;
    const newWindow = event.ctrlKey || event.which == 2 || event.button == 4;
    this.navigationService.navigate(route, newWindow);
  }

  async rerunFlow(
    run: FlowRun,
    strategy: FlowRerunStrategy,
    event: MouseEvent
  ) {
    this.runsService.rerun(run.id, strategy);
    run.status = ExecutionOutputStatus.RUNNING;
    event.stopPropagation();
  }

  isRerunEnabled(run: FlowRun) {
    const enabledStatuses = [
      ExecutionOutputStatus.FAILED,
      ExecutionOutputStatus.INTERNAL_ERROR,
      ExecutionOutputStatus.QUOTA_EXCEEDED,
    ];

    return enabledStatuses.includes(run.status);
  }
}
