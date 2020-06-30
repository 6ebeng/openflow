module openflow {
    // "use strict";



    function treatAsUTC(date): number {
        var result = new Date(date);
        result.setMinutes(result.getMinutes() - result.getTimezoneOffset());
        return result as any;
    }

    function daysBetween(startDate, endDate): number {
        var millisecondsPerDay = 24 * 60 * 60 * 1000;
        return (treatAsUTC(endDate) - treatAsUTC(startDate)) / millisecondsPerDay;
    }
    declare var jsondiffpatch: any;
    declare var Formio: any;
    declare var FileSaver: any;

    export class RPAWorkflowCtrl extends entityCtrl<openflow.RPAWorkflow> {
        public arguments: any;
        public users: TokenUser[];
        public user: TokenUser;
        public messages: string;
        public queuename: string = "";
        public timeout: string = (60 * 1000).toString(); // 1 min;
        constructor(
            public $scope: ng.IScope,
            public $location: ng.ILocationService,
            public $routeParams: ng.route.IRouteParamsService,
            public $interval: ng.IIntervalService,
            public WebSocketClient: WebSocketClient,
            public api: api
        ) {
            super($scope, $location, $routeParams, $interval, WebSocketClient, api);
            console.debug("RPAWorkflowCtrl");
            this.collection = "openrpa";
            this.messages = "";
            WebSocketClient.onSignedin(async (_user: TokenUser) => {
                if (this.id !== null && this.id !== undefined) {
                    this.queuename = await api.RegisterQueue();
                    console.log(this.queuename);
                    await this.loadData();
                    await this.loadUsers();
                    $scope.$on('queuemessage', (event, data: QueueMessage) => {
                        if (event && data) { }
                        console.debug(data);
                        if (data.data.command == undefined && data.data.data != null) data.data = data.data.data;
                        this.messages += data.data.command + "\n";
                        if (data.data.command == "invokecompleted") {
                            this.arguments = data.data.data;
                        }
                        if (data.data.command == "invokefailed") {
                            if (data.data && data.data.data && data.data.data.Message) {
                                this.errormessage = data.data.data.Message;
                            } else {
                                this.errormessage = JSON.stringify(data.data);
                            }

                        }

                        if (!this.$scope.$$phase) { this.$scope.$apply(); }
                    });

                } else {
                    console.error("Missing id");
                }
            });
        }
        async loadUsers(): Promise<void> {
            this.users = await this.api.Query("users", { $or: [{ _type: "user" }, { _type: "role", rparole: true }] }, null, null);
            this.users.forEach(user => {
                if (user._id == this.model._createdbyid || user._id == this.model._createdbyid) {
                    this.user = user;
                }
            });
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        async submit(): Promise<void> {

            try {
                this.errormessage = "";
                var rpacommand = {
                    command: "invoke",
                    workflowid: this.model._id,
                    data: this.arguments
                }
                if (this.arguments === null || this.arguments === undefined) { this.arguments = {}; }
                var result: any = await this.api.QueueMessage(this.user._id, this.queuename, rpacommand, parseInt(this.timeout));
                try {
                    // result = JSON.parse(result);
                } catch (error) {
                }
            } catch (error) {
                this.errormessage = JSON.stringify(error);
            }
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
    }

    export class RPAWorkflowsCtrl extends entitiesCtrl<openflow.Base> {
        public message: string = "";
        public charts: chartset[] = [];
        constructor(
            public $scope: ng.IScope,
            public $location: ng.ILocationService,
            public $routeParams: ng.route.IRouteParamsService,
            public $interval: ng.IIntervalService,
            public WebSocketClient: WebSocketClient,
            public api: api,
            public userdata: userdata
        ) {
            super($scope, $location, $routeParams, $interval, WebSocketClient, api, userdata);
            console.debug("RPAWorkflowsCtrl");
            this.collection = "openrpa";
            this.basequery = { _type: "workflow" };
            this.baseprojection = { _type: 1, type: 1, name: 1, _created: 1, _createdby: 1, _modified: 1, projectandname: 1 };
            this.postloadData = this.processdata;
            WebSocketClient.onSignedin((user: TokenUser) => {
                this.loadData();
            });
        }
        processdata() {
            this.loading = true;
            this.loading = false;
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
            this.dographs();
        }
        async dographs() {
            var chart: chartset = null;
            var agg: any = {};
            var data: any = {};

            var datatimeframe = new Date(new Date().toISOString());
            datatimeframe.setDate(datatimeframe.getDate() - 5);
            agg = [
                { $match: { _created: { "$gte": datatimeframe } } },
                {
                    $group:
                    {
                        _id:
                        {
                            WorkflowId: "$WorkflowId",
                            name: "$name",
                            day: { $dayOfMonth: "$_created" }
                        },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { "_id.day": 1 } }
                // ,{ "$limit": 20 }
            ];
            var workflowruns = await this.api.Aggregate("openrpa_instances", agg);


            for (var i = 0; i < this.models.length; i++) {
                var workflow = this.models[i] as any;

                chart = new chartset();
                chart.data = [];
                for (var x = 0; x < workflowruns.length; x++) {
                    if (workflowruns[x]._id.WorkflowId == workflow._id) {
                        chart.data.push(workflowruns[x].count);
                        chart.labels.push(workflowruns[x]._id.day);
                    }
                }
                if (chart.data.length > 0) {
                    workflow.chart = chart;
                    if (!this.$scope.$$phase) { this.$scope.$apply(); }
                }

            }

        }
        download(data, filename, type) {
            var file = new Blob([data], { type: type });
            if (window.navigator.msSaveOrOpenBlob) // IE10+
                window.navigator.msSaveOrOpenBlob(file, filename);
            else { // Others
                var a = document.createElement("a"),
                    url = URL.createObjectURL(file);
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                setTimeout(function () {
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(url);
                }, 0);
            }
        }
        async Download(model: any) {
            var workflows = await this.api.Query("openrpa", { _type: "workflow", _id: model._id }, null, null);
            if (workflows.length > 0) {
                model = workflows[0];
                this.download(model.Xaml, model.name + ".xaml", "application/xaml+xml");
            }
        }

    }


    export class WorkflowsCtrl extends entitiesCtrl<openflow.Base> {
        public message: string = "";
        public charts: chartset[] = [];
        constructor(
            public $scope: ng.IScope,
            public $location: ng.ILocationService,
            public $routeParams: ng.route.IRouteParamsService,
            public $interval: ng.IIntervalService,
            public WebSocketClient: WebSocketClient,
            public api: api,
            public userdata: userdata
        ) {
            super($scope, $location, $routeParams, $interval, WebSocketClient, api, userdata);
            this.collection = "workflow";
            this.basequery = { _type: "workflow", web: true };
            console.debug("WorkflowsCtrl");
            WebSocketClient.onSignedin((user: TokenUser) => {
                this.loadData();
            });
        }
    }


    export class chartset {
        options: any = {
            legend: { display: true }
        };
        // baseColors: string[] = ['#F7464A', '#97BBCD', '#FDB45C', '#46BFBD', '#949FB1', '#4D5360'];
        // baseColors: string[] = ['#803690', '#00ADF9', '#DCDCDC', '#46BFBD', '#FDB45C', '#949FB1', '#4D5360'];
        baseColors: [
            '#97BBCD', // blue
            '#DCDCDC', // light grey
            '#F7464A', // red
            '#46BFBD', // green
            '#FDB45C', // yellow
            '#949FB1', // grey
            '#4D5360'  // dark grey
        ];
        colors: string[] = this.baseColors;
        type: string = 'bar';
        heading: string = "";
        labels: string[] = [];
        series: string[] = [];
        data: any[] = [];
        ids: any[] = [];
        charttype: string = "bar";
        click: any = null;
    }
    export declare function emit(k, v);
    export class ReportsCtrl extends entitiesCtrl<openflow.Base> {
        public message: string = "";
        public charts: chartset[] = [];
        public datatimeframe: Date;
        public onlinetimeframe: Date;
        public timeframedesc: string = "";
        constructor(
            public $scope: ng.IScope,
            public $location: ng.ILocationService,
            public $routeParams: ng.route.IRouteParamsService,
            public $interval: ng.IIntervalService,
            public WebSocketClient: WebSocketClient,
            public api: api,
            public userdata: userdata
        ) {
            super($scope, $location, $routeParams, $interval, WebSocketClient, api, userdata);
            console.debug("ReportsCtrl");
            WebSocketClient.onSignedin((user: TokenUser) => {
                if (this.userdata.data.ReportsCtrl) {
                    this.datatimeframe = this.userdata.data.ReportsCtrl.datatimeframe;
                    this.onlinetimeframe = this.userdata.data.ReportsCtrl.onlinetimeframe;
                    this.processData();
                } else {
                    this.settimeframe(30, 0, "30 days");
                }

            });
        }
        settimeframe(days, hours, desc) {
            this.datatimeframe = new Date(new Date().toISOString());
            if (days > 0) this.datatimeframe.setDate(this.datatimeframe.getDate() - days);
            if (hours > 0) this.datatimeframe.setHours(this.datatimeframe.getHours() - hours);
            this.timeframedesc = desc;

            this.onlinetimeframe = new Date(new Date().toISOString());
            this.onlinetimeframe.setMinutes(this.onlinetimeframe.getMinutes() - 1);
            // this.datatimeframe = new Date(new Date().toISOString());
            // this.datatimeframe.setMonth(this.datatimeframe.getMonth() - 1);

            // dt = new Date(new Date().toISOString());
            // dt.setMonth(dt.getMonth() - 1);
            // //dt.setDate(dt.getDate() - 1);
            // dt = new Date(new Date().toISOString());
            // dt.setMonth(dt.getMonth() - 1);
            // var dt2 = new Date(new Date().toISOString());
            // dt2.setMinutes(dt.getMinutes() - 1);

            if (!this.userdata.data.ReportsCtrl) this.userdata.data.ReportsCtrl = { run: this.processData.bind(this) };
            this.userdata.data.ReportsCtrl.datatimeframe = this.datatimeframe;
            this.userdata.data.ReportsCtrl.onlinetimeframe = this.onlinetimeframe;
            this.userdata.data.ReportsCtrl.run(this.userdata.data.ReportsCtrl.points);
        }
        async processData(): Promise<void> {
            console.debug('processData');
            this.userdata.data.ReportsCtrl.run = this.processData.bind(this);
            this.userdata.data.ReportsCtrl.points = null;
            this.loading = true;
            this.charts = [];
            var chart: chartset = null;
            var agg: any = {};
            var data: any = {};

            // fuck it, lets just focus on robots who have been online the last month
            // agg = [
            //     { $match: { _rpaheartbeat: { "$exists": true } } },
            //     { "$count": "_rpaheartbeat" }
            // ];
            agg = [
                { $match: { _rpaheartbeat: { "$gte": this.datatimeframe } } },
                { "$count": "_rpaheartbeat" }
            ];
            data = await this.api.Aggregate("users", agg);
            var totalrobots = 0;
            if (data.length > 0) totalrobots = data[0]._rpaheartbeat;

            agg = [
                { $match: { _rpaheartbeat: { "$gte": this.onlinetimeframe } } },
                { "$count": "_rpaheartbeat" }
            ];
            data = await this.api.Aggregate("users", agg);
            var onlinerobots = 0;
            if (data.length > 0) onlinerobots = data[0]._rpaheartbeat;

            chart = new chartset();
            chart.heading = onlinerobots + " Online and " + (totalrobots - onlinerobots) + " offline robots, seen the last " + this.timeframedesc;
            chart.labels = ['online', 'offline'];
            chart.data = [onlinerobots, (totalrobots - onlinerobots)];
            chart.charttype = "pie";
            chart.colors = [
                // '#98FB98', // very light green
                // '#F08080', // very light red
                // '#228B22', // green
                // '#B22222', // red
                '#006400', // green
                '#8B0000', // red
            ];

            // chart.click = this.robotsclick.bind(this);
            chart.click = this.robotsclick.bind(this);
            this.charts.push(chart);
            if (!this.$scope.$$phase) { this.$scope.$apply(); }


            // var agg = [{ "$group": { "_id": "$_type", "count": { "$sum": 1 } } }];

            agg = [
                { $match: { _created: { "$gte": this.datatimeframe }, _type: "workflowinstance" } },
                { "$group": { "_id": { "WorkflowId": "$WorkflowId", "name": "$name" }, "count": { "$sum": 1 } } },
                { $sort: { "count": -1 } },
                { "$limit": 20 }
            ];
            var workflowruns = await this.api.Aggregate("openrpa_instances", agg);


            chart = new chartset();
            chart.heading = "Workflow runs (top 20)";
            // chart.series = ['name', 'count'];
            // chart.labels = ['name', 'count'];
            chart.data = [];
            chart.ids = [];
            for (var x = 0; x < workflowruns.length; x++) {
                // chart.data[0].push(workflowruns[x]._id.name);
                // chart.data[1].push(workflowruns[x].count);
                chart.data.push(workflowruns[x].count);
                chart.ids.push(workflowruns[x]._id.WorkflowId);
                chart.labels.push(workflowruns[x]._id.name);
                //     if (workflow == undefined) { chart.labels.push("unknown"); } else { chart.labels.push(workflow.name); }
                // }
            }
            chart.click = this.workflowclick.bind(this);
            this.charts.push(chart);



            this.loading = false;
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        async robotsclick(points, evt): Promise<void> {
            console.debug('robotsclick');
            this.userdata.data.ReportsCtrl.run = this.robotsclick.bind(this);
            this.userdata.data.ReportsCtrl.points = points;
            if (points.length > 0) {
            } else { return; }
            var chart: chartset = null;
            var agg: any = {};
            var data: any = {};
            // 
            // { "$limit": 20 }
            var rpaheartbeat: any = [];
            if (points[0]._index == 0) // Online robots
            {
                // rpaheartbeat = { $match: { "user._rpaheartbeat": { "$gte": this.onlinetimeframe } } };
                rpaheartbeat = { $match: { "_rpaheartbeat": { "$gte": this.onlinetimeframe } } };
            } else {

                // rpaheartbeat = { $match: { "user._rpaheartbeat": { "$lt": this.onlinetimeframe } } };
                rpaheartbeat = { $match: { "_rpaheartbeat": { "$lt": this.onlinetimeframe } } };
            }
            this.charts = [];
            agg = [
                { $match: { _type: 'user' } }
                , { $sort: { "_rpaheartbeat": -1 } }
                , { "$limit": 20 }
                , rpaheartbeat
                , {
                    $lookup: {
                        from: "audit",
                        localField: "_id",
                        foreignField: "userid",
                        as: "audit"
                    }
                }
                , {
                    $project: {
                        "_id": 1,
                        "name": 1,
                        "count": { "$size": "$audit" }
                    }
                }
                , { $sort: { "count": -1 } }
                // , { $sort: { "_rpaheartbeat": -1 } }
                // , { "$limit": 20 }
            ];

            var data = await this.api.Aggregate("users", agg);

            chart = new chartset();
            if (points[0]._index == 0) // Online robots
            {
                chart.heading = "Logins per online robot the last " + this.timeframedesc + " (top 20)";
            } else {
                chart.heading = "Logins per offline robot the last " + this.timeframedesc + " (top 20)";
            }
            chart.data = [];
            chart.ids = [];
            for (var x = 0; x < data.length; x++) {
                chart.data.push(data[x].count);
                chart.ids.push(data[x]._id);
                chart.labels.push(data[x].name);
            }
            chart.click = this.robotclick.bind(this);
            this.charts.push(chart);
            if (!this.$scope.$$phase) { this.$scope.$apply(); }


            if (points[0]._index == 0) // Online robots
            {
                rpaheartbeat = { $match: { "user._rpaheartbeat": { "$gte": this.onlinetimeframe } } };
            } else {
                rpaheartbeat = { $match: { "user._rpaheartbeat": { "$lt": this.onlinetimeframe } } };
            }

            agg = [
                { $match: { _created: { "$gte": this.datatimeframe }, _type: "workflowinstance" } },
                {
                    $lookup: {
                        from: "users",
                        localField: "ownerid",
                        foreignField: "_id",
                        as: "userarr"
                    }
                },
                {
                    "$project": {
                        "WorkflowId": 1,
                        "name": 1,
                        "user": { "$arrayElemAt": ["$userarr", 0] }
                    }
                },
                {
                    "$project": {
                        "WorkflowId": 1,
                        "newname": { $concat: ["$name", " (", "$user.name", ")"] },
                        "name": 1,
                        "user": 1
                    }
                },
                rpaheartbeat,
                // { $project: { "newname":  } },


                { "$group": { "_id": { "WorkflowId": "$WorkflowId", "name": "$newname" }, "count": { "$sum": 1 } } },
                { $sort: { "count": -1 } },
                { "$limit": 20 }
            ];
            var workflowruns = await this.api.Aggregate("openrpa_instances", agg);

            chart = new chartset();
            if (points[0]._index == 0) // Online robots
            {
                chart.heading = "Workflow runs for online robots (top 20)";
            } else {
                chart.heading = "Workflow runs for offline robots (top 20)";
            }
            chart.data = [];
            chart.ids = [];
            for (var x = 0; x < workflowruns.length; x++) {
                chart.data.push(workflowruns[x].count);
                chart.ids.push(workflowruns[x]._id.WorkflowId);
                chart.labels.push(workflowruns[x]._id.name);
            }
            chart.click = this.workflowclick.bind(this);
            this.charts.push(chart);


            if (!this.$scope.$$phase) { this.$scope.$apply(); }

        }
        async robotclick(points, evt): Promise<void> {
            console.debug('robotclick');
            if (points.length > 0) {
            } else { return; }
            var userid = this.charts[0].ids[points[0]._index];
            var chart: chartset = null;
            var agg: any = {};
            var data: any = {};


            agg = [
                { $match: { _created: { "$gte": this.datatimeframe }, _type: "workflowinstance", ownerid: userid } },
                { "$group": { "_id": { "WorkflowId": "$WorkflowId", "name": "$name", "owner": "$owner" }, "count": { "$sum": 1 } } },
                { $sort: { "count": -1 } },
                { "$limit": 20 }
            ];
            var workflowruns = await this.api.Aggregate("openrpa_instances", agg);

            chart = new chartset();
            if (workflowruns.length > 0) // Online robots
            {
                chart.heading = "Workflow runs for " + workflowruns[0].owner + " (top 20)";
            } else {
                chart.heading = "No data (or permissions) for robot";
            }
            chart.data = [];
            chart.ids = [];
            for (var x = 0; x < workflowruns.length; x++) {
                chart.data.push(workflowruns[x].count);
                chart.ids.push(workflowruns[x]._id.WorkflowId);
                chart.labels.push(workflowruns[x]._id.name);
            }
            chart.click = this.workflowclick.bind(this);
            this.charts.splice(1, 1);
            this.charts.push(chart);


            if (!this.$scope.$$phase) { this.$scope.$apply(); }

        }
        async workflowclick(points, evt): Promise<void> {
            console.debug('workflowclick');
            if (points.length > 0) {
            } else { return; }

            var WorkflowId = this.charts[1].ids[points[0]._index];

            var chart: chartset = null;
            var agg: any = {};
            var data: any = {};

            agg = [
                { $match: { _created: { "$gte": this.datatimeframe }, WorkflowId: WorkflowId } },
                {
                    $group:
                    {
                        _id:
                        {
                            name: "$name",
                            day: { $dayOfMonth: "$_created" },
                            month: { $month: "$_created" },
                            year: { $year: "$_created" }
                        },
                        total: { $sum: "$data" },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { "_id.day": 1 } },
                { "$limit": 20 }
            ];
            var workflowruns = await this.api.Aggregate("openrpa_instances", agg);

            chart = new chartset();
            if (workflowruns.length > 0) {
                chart.heading = "Number of runs per day for " + workflowruns[0]._id.name;
            } else {
                chart.heading = "No data ";
            }
            chart.data = [];
            for (var x = 0; x < workflowruns.length; x++) {
                chart.data.push(workflowruns[x].count);
                chart.labels.push(workflowruns[x]._id.day);
            }
            chart.click = this.processData.bind(this);
            this.charts.splice(1, 1);
            this.charts.push(chart);


            if (!this.$scope.$$phase) { this.$scope.$apply(); }

        }
        async InsertNew(): Promise<void> {
            // this.loading = true;
            var model = { name: "Find me " + Math.random().toString(36).substr(2, 9), "temp": "hi mom" };
            var result = await this.api.Insert(this.collection, model);
            this.models.push(result);
            this.loading = false;
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        async UpdateOne(model: any): Promise<any> {
            var index = this.models.indexOf(model);
            this.loading = true;
            model.name = "Find me " + Math.random().toString(36).substr(2, 9);
            var newmodel = await this.api.Update(this.collection, model);
            this.models = this.models.filter(function (m: any): boolean { return m._id !== model._id; });
            this.models.splice(index, 0, newmodel);
            this.loading = false;
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        async DeleteOne(model: any): Promise<any> {
            this.loading = true;
            await this.api.Delete(this.collection, model);
            this.models = this.models.filter(function (m: any): boolean { return m._id !== model._id; });
            this.loading = false;
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        async InsertMany(): Promise<void> {
            this.loading = true;
            var Promises: Promise<InsertOneMessage>[] = [];
            var q: InsertOneMessage = new InsertOneMessage();
            for (var i: number = (this.models.length); i < (this.models.length + 50); i++) {
                q.collectionname = "entities"; q.item = { name: "findme " + i.toString(), "temp": "hi mom" };
                var msg: Message = new Message(); msg.command = "insertone"; msg.data = JSON.stringify(q);
                Promises.push(this.WebSocketClient.Send(msg));
            }
            const results: any = await Promise.all(Promises.map(p => p.catch(e => e)));
            const values: InsertOneMessage[] = results.filter(result => !(result instanceof Error));
            // this.models.push(...values);
            values.forEach(element => {
                this.models.push(element.result);
            });
            this.loading = false;
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        async DeleteMany(): Promise<void> {
            this.loading = true;
            var Promises: Promise<DeleteOneMessage>[] = [];
            var q: DeleteOneMessage = new DeleteOneMessage();
            this.models.forEach(model => {
                q.collectionname = "entities"; q._id = (model as any)._id;
                var msg: Message = new Message(); msg.command = "deleteone"; msg.data = JSON.stringify(q);
                Promises.push(this.WebSocketClient.Send(msg));
            });
            const results: any = await Promise.all(Promises.map(p => p.catch(e => e)));
            const values: DeleteOneMessage[] = results.filter(result => !(result instanceof Error));
            var ids: string[] = [];
            values.forEach((x: DeleteOneMessage) => ids.push(x._id));
            this.models = this.models.filter(function (m: any): boolean { return ids.indexOf(m._id) === -1; });
            this.loading = false;
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
    }

    export class MainCtrl extends entitiesCtrl<openflow.Base> {
        public showcompleted: boolean = false;
        constructor(
            public $scope: ng.IScope,
            public $location: ng.ILocationService,
            public $routeParams: ng.route.IRouteParamsService,
            public $interval: ng.IIntervalService,
            public WebSocketClient: WebSocketClient,
            public api: api,
            public userdata: userdata
        ) {
            super($scope, $location, $routeParams, $interval, WebSocketClient, api, userdata);
            console.debug("MainCtrl");
            this.collection = "workflow_instances"
            // this.basequery = { state: { $ne: "completed" }, $and: [{ form: { $exists: true } }, { form: { "$ne": "none" } }] };
            // this.basequery = { state: { $ne: "completed" }, form: { $exists: true } };
            this.preloadData = () => {
                var user = this.WebSocketClient.user;
                var ors: any[] = [];
                ors.push({ targetid: user._id });
                this.WebSocketClient.user.roles.forEach(role => {
                    ors.push({ targetid: role._id });
                });
                this.basequery = {};
                this.basequery = { $or: ors };
                if (!this.showcompleted) {
                    // this.basequery.state = { $ne: "completed" };
                    this.basequery["$and"] = [{ state: { $ne: "completed" } }, { state: { $ne: "failed" } }];
                    this.basequery.form = { $exists: true };
                    // this.basequery.$or = ors;
                } else {
                }
            };
            WebSocketClient.onSignedin((_user: TokenUser) => {
                this.loadData();
            });

        }
    }
    declare var QRScanner: any;
    export class LoginCtrl {
        public localenabled: boolean = false;
        public scanning: boolean = false;
        public qrcodescan: boolean = false;
        public providers: any = false;
        public username: string = "";
        public password: string = "";
        public message: string = "";
        public domain: string = "";
        public allow_user_registration: boolean = false;
        public static $inject = [
            "$scope",
            "$location",
            "$routeParams",
            "WebSocketClient",
            "api"
        ];
        constructor(
            public $scope: ng.IScope,
            public $location: ng.ILocationService,
            public $routeParams: ng.route.IRouteParamsService,
            public WebSocketClient: WebSocketClient,
            public api: api
        ) {
            console.debug("LoginCtrl::constructor");
            this.domain = window.location.hostname;
            WebSocketClient.getJSON("/loginproviders", async (error: any, data: any) => {
                this.providers = data;
                this.allow_user_registration = WebSocketClient.allow_user_registration;
                for (var i: number = this.providers.length - 1; i >= 0; i--) {
                    if (this.providers[i].provider == "local") {
                        this.providers.splice(i, 1);
                        this.localenabled = true;
                    }
                }
                if (!this.$scope.$$phase) { this.$scope.$apply(); }
                setTimeout(this.scanForQRScanner.bind(this), 200);
            });
        }
        readfile(filename: string) {
            return new Promise<string>(async (resolve, reject) => {
                var win: any = window;
                //var type = win.TEMPORARY;
                var type = win.PERSISTENT;
                var size = 5 * 1024 * 1024;
                win.requestFileSystem(type, size, successCallback, errorCallback)
                function successCallback(fs) {
                    fs.root.getFile(filename, {}, function (fileEntry) {

                        fileEntry.file(function (file) {
                            var reader = new FileReader();
                            reader.onloadend = function (e) {
                                resolve(this.result as string);
                            };
                            reader.readAsText(file);
                        }, errorCallback);
                    }, errorCallback);
                }
                function errorCallback(error) {
                    console.debug(error);
                    resolve();
                }
            });
        }
        writefile(filename: string, content: string) {
            return new Promise<string>(async (resolve, reject) => {
                var win: any = window;
                //var type = win.TEMPORARY;
                var type = win.PERSISTENT;
                var size = 5 * 1024 * 1024;
                win.requestFileSystem(type, size, successCallback, errorCallback)
                function successCallback(fs) {
                    fs.root.getFile(filename, { create: true }, function (fileEntry) {
                        fileEntry.createWriter(function (fileWriter) {
                            fileWriter.onwriteend = function (e) {
                                console.debug('Write completed.');
                                resolve();
                            };
                            fileWriter.onerror = function (e) {
                                console.error('Write failed: ' + e.toString());
                                resolve();
                            };
                            var blob = new Blob([content], { type: 'text/plain' });
                            fileWriter.write(blob);
                        }, errorCallback);
                    }, errorCallback);
                }
                function errorCallback(error) {
                    console.error(error);
                    resolve();
                }
            });
        }
        scanForQRScanner() {
            try {
                if (QRScanner !== undefined) {
                    console.debug("Found QRScanner!!!!");
                    this.qrcodescan = true;
                    if (!this.$scope.$$phase) { this.$scope.$apply(); }
                } else {
                    console.debug("QRScanner not definded");
                    setTimeout(this.scanForQRScanner, 200);
                }
            } catch (error) {
                console.debug("Failed locating QRScanner");
                setTimeout(this.scanForQRScanner, 200);
            }
        }
        Scan() {
            try {
                console.debug("Scan");
                if (this.scanning) {
                    this.scanning = false;
                    QRScanner.destroy();
                    if (!this.$scope.$$phase) { this.$scope.$apply(); }
                    return;
                }
                this.scanning = true;
                QRScanner.scan(this.QRScannerHit.bind(this));
                QRScanner.show();
                if (!this.$scope.$$phase) { this.$scope.$apply(); }
            } catch (error) {
                console.error("Error Scan");
                console.error(error);
            }
        }
        async QRScannerHit(err, value) {
            try {
                console.debug("QRScannerHit");
                if (err) {
                    // console.error(err._message);
                    console.error(err);
                    return;
                }
                console.debug(value);
                QRScanner.hide();
                QRScanner.destroy();

                this.scanning = false;
                if (!this.$scope.$$phase) { this.$scope.$apply(); }
                if (value === null || value === undefined || value === "") {
                    console.debug("QRCode had null value"); return;
                }
                console.debug("QRCode value: " + value);
                var config = JSON.parse(value);
                if (config.url !== null || config.url !== undefined || config.url !== "" || config.loginurl !== null || config.loginurl !== undefined || config.loginurl !== "") {
                    console.debug("set mobiledomain to " + value);
                    await this.writefile("mobiledomain.txt", value);
                    window.location.replace(config.url);
                }
            } catch (error) {
                console.error("Error QRScannerHit");
                console.error(error);

            }
        }
        async submit(): Promise<void> {
            this.message = "";
            try {
                console.debug("signing in with username/password");
                var result: SigninMessage = await this.api.SigninWithUsername(this.username, this.password, null);
                if (result.user == null) { return; }
                this.$location.path("/");
            } catch (error) {
                this.message = error;
                console.error(error);
            }
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        Signup() {
            this.$location.path("/Signup");
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
    }
    export class MenuCtrl {
        public user: TokenUser;
        public signedin: boolean = false;
        public path: string = "";
        public static $inject = [
            "$scope",
            "$location",
            "$routeParams",
            "WebSocketClient",
            "api"
        ];
        constructor(
            public $scope: ng.IScope,
            public $location: ng.ILocationService,
            public $routeParams: ng.route.IRouteParamsService,
            public WebSocketClient: WebSocketClient,
            public api: api
        ) {
            console.debug("MenuCtrl::constructor");
            $scope.$root.$on('$routeChangeStart', (...args) => { this.routeChangeStart.apply(this, args); });
            this.path = this.$location.path();
            var cleanup = this.$scope.$on('signin', (event, data) => {
                if (event && data) { }
                this.user = data.user;
                this.signedin = true;
                if (!this.$scope.$$phase) { this.$scope.$apply(); }
                // cleanup();
            });
        }
        routeChangeStart(event: any, next: any, current: any) {
            this.path = this.$location.path();
        }
        hasrole(role: string) {
            if (this.WebSocketClient.user === null || this.WebSocketClient.user === undefined) return false;
            var hits = this.WebSocketClient.user.roles.filter(member => member.name == role);
            return (hits.length == 1)
        }
        hascordova() {
            return this.WebSocketClient.usingCordova;
        }
        stopimpersonation() {
            this.api.gettoken();
        }
        PathIs(path: string) {
            if (this.path == null && this.path == undefined) return false;
            return this.path.startsWith(path);
        }
    }

    export class ProvidersCtrl extends entitiesCtrl<openflow.Provider> {
        constructor(
            public $scope: ng.IScope,
            public $location: ng.ILocationService,
            public $routeParams: ng.route.IRouteParamsService,
            public $interval: ng.IIntervalService,
            public WebSocketClient: WebSocketClient,
            public api,
            public userdata: userdata
        ) {
            super($scope, $location, $routeParams, $interval, WebSocketClient, api, userdata);
            console.debug("ProvidersCtrl");
            this.basequery = { _type: "provider" };
            this.collection = "config";
            WebSocketClient.onSignedin((user: TokenUser) => {
                this.loadData();
            });
        }
        async DeleteOne(model: any): Promise<any> {
            this.loading = true;
            await this.api.Delete(this.collection, model);
            this.models = this.models.filter(function (m: any): boolean { return m._id !== model._id; });
            this.loading = false;
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }

    }
    export class ProviderCtrl extends entityCtrl<openflow.Provider> {
        constructor(
            public $scope: ng.IScope,
            public $location: ng.ILocationService,
            public $routeParams: ng.route.IRouteParamsService,
            public $interval: ng.IIntervalService,
            public WebSocketClient: WebSocketClient,
            public api: api
        ) {
            super($scope, $location, $routeParams, $interval, WebSocketClient, api);
            console.debug("ProviderCtrl");
            this.collection = "config";
            WebSocketClient.onSignedin((user: TokenUser) => {
                if (this.id !== null && this.id !== undefined) {
                    this.loadData();
                } else {
                    this.model = new Provider("", "", "", "uri:" + this.WebSocketClient.domain,
                        "")
                }

            });
        }
        async submit(): Promise<void> {
            if (this.model._id) {
                await this.api.Update(this.collection, this.model);
            } else {
                await this.api.Insert(this.collection, this.model);
            }
            this.$location.path("/Providers");
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
    }



    export class UsersCtrl extends entitiesCtrl<openflow.TokenUser> {
        constructor(
            public $scope: ng.IScope,
            public $location: ng.ILocationService,
            public $routeParams: ng.route.IRouteParamsService,
            public $interval: ng.IIntervalService,
            public WebSocketClient: WebSocketClient,
            public api: api,
            public userdata: userdata
        ) {
            super($scope, $location, $routeParams, $interval, WebSocketClient, api, userdata);
            this.autorefresh = true;
            console.debug("UsersCtrl");
            this.basequery = { _type: "user" };
            this.collection = "users";
            this.searchfields = ["name", "username"];
            this.postloadData = this.processData;
            if (this.userdata.data.UsersCtrl) {
                this.basequery = this.userdata.data.UsersCtrl.basequery;
                this.collection = this.userdata.data.UsersCtrl.collection;
                this.baseprojection = this.userdata.data.UsersCtrl.baseprojection;
                this.orderby = this.userdata.data.UsersCtrl.orderby;
                this.searchstring = this.userdata.data.UsersCtrl.searchstring;
                this.basequeryas = this.userdata.data.UsersCtrl.basequeryas;
            }

            WebSocketClient.onSignedin((user: TokenUser) => {
                this.loadData();
            });
        }
        async processData(): Promise<void> {
            if (!this.userdata.data.UsersCtrl) this.userdata.data.UsersCtrl = {};
            this.userdata.data.UsersCtrl.basequery = this.basequery;
            this.userdata.data.UsersCtrl.collection = this.collection;
            this.userdata.data.UsersCtrl.baseprojection = this.baseprojection;
            this.userdata.data.UsersCtrl.orderby = this.orderby;
            this.userdata.data.UsersCtrl.searchstring = this.searchstring;
            this.userdata.data.UsersCtrl.basequeryas = this.basequeryas;
            var chart: chartset = null;
            this.loading = false;
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        async Impersonate(model: openflow.TokenUser): Promise<any> {
            this.loading = true;
            var result = await this.api.SigninWithToken(this.WebSocketClient.jwt, null, model._id);
            this.loading = false;
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        async DeleteOneUser(model: openflow.TokenUser): Promise<any> {
            this.loading = true;
            await this.api.Delete(this.collection, model);
            this.models = this.models.filter(function (m: any): boolean { return m._id !== model._id; });
            this.loading = false;
            var name = model.username;
            name = name.split("@").join("").split(".").join("");
            name = name.toLowerCase();

            var list = await this.api.Query("users", { _type: "role", name: name + "noderedadmins" });
            if (list.length == 1) {
                console.debug("Deleting " + name + "noderedadmins")
                await this.api.Delete("users", list[0]);
            }

            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
    }
    export class UserCtrl extends entityCtrl<openflow.TokenUser> {
        public newid: string;
        public memberof: openflow.Role[];
        constructor(
            public $scope: ng.IScope,
            public $location: ng.ILocationService,
            public $routeParams: ng.route.IRouteParamsService,
            public $interval: ng.IIntervalService,
            public WebSocketClient: WebSocketClient,
            public api: api
        ) {
            super($scope, $location, $routeParams, $interval, WebSocketClient, api);
            console.debug("UserCtrl");
            this.collection = "users";
            this.postloadData = this.processdata;
            this.memberof = [];
            WebSocketClient.onSignedin((user: TokenUser) => {
                if (this.id !== null && this.id !== undefined) {
                    this.loadData();
                } else {
                    this.model = new openflow.TokenUser("", "");
                    this.model._type = "user";
                    this.model.name = "";
                    this.model.username = "";
                    this.model.newpassword = "";
                    this.model.sid = "";
                    this.model.federationids = [];
                    this.processdata();
                }

            });
        }
        async processdata() {
            if (this.model != null && (this.model._id != null && this.model._id != "")) {
                this.memberof = await this.api.Query("users",
                    {
                        $and: [
                            { _type: "role" },
                            { members: { $elemMatch: { _id: this.model._id } } }
                        ]
                    }, null, { _type: -1, name: 1 }, 5);
            } else {
                this.memberof = [];
            }
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        deleteid(id) {
            if (this.model.federationids === null || this.model.federationids === undefined) {
                this.model.federationids = [];
            }
            this.model.federationids = this.model.federationids.filter(function (m: any): boolean { return m !== id; });
        }
        addid() {
            if (this.model.federationids === null || this.model.federationids === undefined) {
                this.model.federationids = [];
            }
            this.model.federationids.push(this.newid);
        }
        RemoveMember(model: openflow.Role) {
            this.memberof = this.memberof.filter(x => x._id != model._id);
        }
        async submit(): Promise<void> {
            if (this.model._id) {
                await this.api.Update(this.collection, this.model);
            } else {
                await this.api.Insert(this.collection, this.model);
            }
            this.$location.path("/Users");

            var currentmemberof = await this.api.Query("users",
                {
                    $and: [
                        { _type: "role" },
                        { members: { $elemMatch: { _id: this.model._id } } }
                    ]
                }, null, { _type: -1, name: 1 }, 5);
            for (var i = 0; i < currentmemberof.length; i++) {
                var memberof = currentmemberof[i];
                if (this.memberof == null || this.memberof == undefined) this.memberof = [];
                var exists = this.memberof.filter(x => x._id == memberof._id);
                if (exists.length == 0) {
                    console.debug("Updating members of " + memberof.name + " " + memberof._id);
                    console.debug("members: " + memberof.members.length);
                    memberof.members = memberof.members.filter(x => x._id != this.model._id);
                    console.debug("members: " + memberof.members.length);
                    await this.api.Update("users", memberof);
                }
            }

            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
    }





    export class RolesCtrl extends entitiesCtrl<openflow.Role> {
        constructor(
            public $scope: ng.IScope,
            public $location: ng.ILocationService,
            public $routeParams: ng.route.IRouteParamsService,
            public $interval: ng.IIntervalService,
            public WebSocketClient: WebSocketClient,
            public api: api,
            public userdata: userdata
        ) {
            super($scope, $location, $routeParams, $interval, WebSocketClient, api, userdata);
            this.autorefresh = true;
            console.debug("RolesCtrl");
            this.basequery = { _type: "role" };
            this.collection = "users";
            this.postloadData = this.processdata;
            if (this.userdata.data.RolesCtrl) {
                this.basequery = this.userdata.data.RolesCtrl.basequery;
                this.collection = this.userdata.data.RolesCtrl.collection;
                this.baseprojection = this.userdata.data.RolesCtrl.baseprojection;
                this.orderby = this.userdata.data.RolesCtrl.orderby;
                this.searchstring = this.userdata.data.RolesCtrl.searchstring;
                this.basequeryas = this.userdata.data.RolesCtrl.basequeryas;
            }
            WebSocketClient.onSignedin((user: TokenUser) => {
                this.loadData();
            });
        }
        processdata() {
            if (!this.userdata.data.RolesCtrl) this.userdata.data.RolesCtrl = {};
            this.userdata.data.RolesCtrl.basequery = this.basequery;
            this.userdata.data.RolesCtrl.collection = this.collection;
            this.userdata.data.RolesCtrl.baseprojection = this.baseprojection;
            this.userdata.data.RolesCtrl.orderby = this.orderby;
            this.userdata.data.RolesCtrl.searchstring = this.searchstring;
            this.userdata.data.RolesCtrl.basequeryas = this.basequeryas;
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        async DeleteOne(model: any): Promise<any> {
            this.loading = true;
            await this.api.Delete(this.collection, model);
            this.models = this.models.filter(function (m: any): boolean { return m._id !== model._id; });
            this.loading = false;
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
    }
    export class RoleCtrl extends entityCtrl<openflow.Role> {
        searchFilteredList: openflow.Role[] = [];
        searchSelectedItem: openflow.Role = null;
        searchtext: string = "";
        e: any = null;

        constructor(
            public $scope: ng.IScope,
            public $location: ng.ILocationService,
            public $routeParams: ng.route.IRouteParamsService,
            public $interval: ng.IIntervalService,
            public WebSocketClient: WebSocketClient,
            public api: api
        ) {
            super($scope, $location, $routeParams, $interval, WebSocketClient, api);
            console.debug("RoleCtrl");
            this.collection = "users";
            WebSocketClient.onSignedin(async (user: TokenUser) => {
                if (this.id !== null && this.id !== undefined) {
                    await this.loadData();
                } else {
                    this.model = new openflow.Role("");
                }
            });
        }
        async submit(): Promise<void> {
            if (this.model._id) {
                await this.api.Update(this.collection, this.model);
            } else {
                await this.api.Insert(this.collection, this.model);
            }
            this.$location.path("/Roles");
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        RemoveMember(model: any) {
            if (this.model.members === undefined) { this.model.members = []; }
            for (var i: number = 0; i < this.model.members.length; i++) {
                if (this.model.members[i]._id === model._id) {
                    this.model.members.splice(i, 1);
                }
            }
        }
        AddMember(model: any) {
            if (this.model.members === undefined) { this.model.members = []; }
            var user: any = null;
            user = this.searchSelectedItem;
            this.model.members.push({ name: user.name, _id: user._id });
            this.searchSelectedItem = null;
            this.searchtext = "";
        }


        restrictInput(e) {
            if (e.keyCode == 13) {
                e.preventDefault();
                return false;
            }
        }
        setkey(e) {
            this.e = e;
            this.handlekeys();
        }
        handlekeys() {
            if (this.searchFilteredList.length > 0) {
                var idx: number = -1;
                for (var i = 0; i < this.searchFilteredList.length; i++) {
                    if (this.searchSelectedItem != null) {
                        if (this.searchFilteredList[i]._id == this.searchSelectedItem._id) {
                            idx = i;
                        }
                    }
                }
                if (this.e.keyCode == 38) { // up
                    if (idx <= 0) {
                        idx = 0;
                    } else { idx--; }
                    // this.searchtext = this.searchFilteredList[idx].name;
                    this.searchSelectedItem = this.searchFilteredList[idx];
                    return;
                }
                else if (this.e.keyCode == 40) { // down
                    if (idx >= this.searchFilteredList.length) {
                        idx = this.searchFilteredList.length - 1;
                    } else { idx++; }
                    // this.searchtext = this.searchFilteredList[idx].name;
                    this.searchSelectedItem = this.searchFilteredList[idx];
                    return;
                }
                else if (this.e.keyCode == 13) { // enter
                    if (idx >= 0) {
                        this.searchtext = this.searchFilteredList[idx].name;
                        this.searchSelectedItem = this.searchFilteredList[idx];
                        this.searchFilteredList = [];
                        if (!this.$scope.$$phase) { this.$scope.$apply(); }
                    }
                    return;
                }
            } else {
                if (this.e.keyCode == 13 && this.searchSelectedItem != null) {
                    this.AddMember(this.searchSelectedItem);
                }
            }
        }
        async handlefilter(e) {
            this.e = e;
            var ids: string[] = this.model.members.map(item => item._id);
            this.searchFilteredList = await this.api.Query("users",
                {
                    $and: [
                        { $or: [{ _type: "user" }, { _type: "role" }] },
                        { name: new RegExp([this.searchtext].join(""), "i") },
                        { _id: { $nin: ids } }
                    ]
                }
                , null, { _type: -1, name: 1 }, 8);
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        fillTextbox(searchtext) {
            this.searchFilteredList.forEach((item: any) => {
                if (item.name.toLowerCase() == searchtext.toLowerCase()) {
                    this.searchtext = item.name;
                    this.searchSelectedItem = item;
                    this.searchFilteredList = [];
                    if (!this.$scope.$$phase) { this.$scope.$apply(); }
                }
            });
        }
    }



    export class SocketCtrl {
        public static $inject = [
            "$scope",
            "$location",
            "$routeParams",
            "WebSocketClient",
            "api"
        ];
        public messages: string = "";
        public queuename: string = "webtest";
        public message: string = "Hi mom";
        constructor(
            public $scope: ng.IScope,
            public $location: ng.ILocationService,
            public $routeParams: ng.route.IRouteParamsService,
            public WebSocketClient: WebSocketClient,
            public api: api
        ) {
            console.debug("SocketCtrl");
            WebSocketClient.onSignedin(async (user: TokenUser) => {
                await api.RegisterQueue();
            });
        }

        async EnsureNoderedInstance(_id: string, name: string) {
            try {
                await this.api.EnsureNoderedInstance(_id, name);
                this.messages += "EnsureNoderedInstance completed" + "\n";
            } catch (error) {
                this.messages += error + "\n";
                console.error(error);
            }
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        async DeleteNoderedInstance(_id: string, name: string) {
            try {
                await this.api.DeleteNoderedInstance(_id, name);
                this.messages += "DeleteNoderedInstance completed" + "\n";
            } catch (error) {
                this.messages += error + "\n";
                console.error(error);
            }
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        async RestartNoderedInstance(_id: string, name: string) {
            try {
                await this.api.RestartNoderedInstance(_id, name);
                this.messages += "RestartNoderedInstance completed" + "\n";
            } catch (error) {
                this.messages += error + "\n";
                console.error(error);
            }
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        async StartNoderedInstance(_id: string, name: string) {
            try {
                await this.api.StartNoderedInstance(_id, name);
                this.messages += "StartNoderedInstance completed" + "\n";
            } catch (error) {
                this.messages += error + "\n";
                console.error(error);
            }
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        async StopNoderedInstance(_id: string, name: string) {
            try {
                await this.api.StopNoderedInstance(_id, name);
                this.messages += "StopNoderedInstance completed" + "\n";
            } catch (error) {
                this.messages += error + "\n";
                console.error(error);
            }
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }

    }



    export class FilesCtrl extends entitiesCtrl<openflow.Base> {
        public file: string;
        constructor(
            public $scope: ng.IScope,
            public $location: ng.ILocationService,
            public $routeParams: ng.route.IRouteParamsService,
            public $interval: ng.IIntervalService,
            public WebSocketClient: WebSocketClient,
            public api: api,
            public userdata: userdata
        ) {
            super($scope, $location, $routeParams, $interval, WebSocketClient, api, userdata);
            console.debug("EntitiesCtrl");
            this.autorefresh = true;
            this.basequery = {};
            this.searchfields = ["metadata.name", "metadata.path"];
            this.collection = "files";
            this.baseprojection = { _type: 1, type: 1, name: 1, _created: 1, _createdby: 1, _modified: 1 };
            var elem = document.getElementById("myBar");
            elem.style.width = '0%';
            WebSocketClient.onSignedin((user: TokenUser) => {
                this.loadData();
            });
        }
        async DeleteOne(model: any): Promise<any> {
            this.loading = true;
            await this.api.Delete(this.collection, model);
            this.models = this.models.filter(function (m: any): boolean { return m._id !== model._id; });
            this.loading = false;
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        async Download(id: string) {
            var lastp: number = 0;
            var fileinfo = await this.api.GetFile(null, id, (msg, index, count) => {
                var p: number = ((index + 1) / count * 100) | 0;
                if (p > lastp || (index + 1) == count) {
                    console.debug(index + "/" + count + " " + p + "%");
                    lastp = p;
                }
                var elem = document.getElementById("myBar");
                elem.style.width = p + '%';
                elem.innerText = p + '%';
                if (p == 100) {
                    elem.innerText = 'Processing ...';
                }
            });
            var elem = document.getElementById("myBar");
            elem.style.width = '0%';
            elem.innerText = '';
            const blob = this.b64toBlob(fileinfo.file, fileinfo.mimeType);
            // const blobUrl = URL.createObjectURL(blob);
            // (window.location as any) = blobUrl;
            var anchor = document.createElement('a');
            anchor.download = fileinfo.metadata.name;
            anchor.href = ((window as any).webkitURL || window.URL).createObjectURL(blob);
            anchor.dataset.downloadurl = [fileinfo.mimeType, anchor.download, anchor.href].join(':');
            anchor.click();
        }
        b64toBlob(b64Data: string, contentType: string, sliceSize: number = 512) {
            contentType = contentType || '';
            sliceSize = sliceSize || 512;
            var byteCharacters = atob(b64Data);
            var byteArrays = [];
            for (var offset = 0; offset < byteCharacters.length; offset += sliceSize) {
                var slice = byteCharacters.slice(offset, offset + sliceSize);
                var byteNumbers = new Array(slice.length);
                for (var i = 0; i < slice.length; i++) {
                    byteNumbers[i] = slice.charCodeAt(i);
                }
                var byteArray = new Uint8Array(byteNumbers);
                byteArrays.push(byteArray);
            }
            var blob = new Blob(byteArrays, { type: contentType });
            return blob;
        }
        async Upload() {
            // const e: any = document.querySelector('input[type="file"]');
            var e: any = document.getElementById('fileupload')
            const fd = new FormData();
            for (var i = 0; i < e.files.length; i++) {
                var file = e.files[i];
                fd.append(e.name, file, file.name);
            };
            const xhr = new XMLHttpRequest();
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    console.debug("upload complete");
                    // we done!
                    if (!this.$scope.$$phase) { this.$scope.$apply(); }
                    this.loadData();

                }
            };
            console.debug("open");
            xhr.open('POST', '/upload', true);
            console.debug("send");
            xhr.send(fd);
        }
        async Upload_usingapi() {
            var filename = (this.$scope as any).filename;
            var type = (this.$scope as any).type;
            console.debug("filename: " + filename + " type: " + type);
            this.loading = true;
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
            var lastp: number = 0;
            await this.api.SaveFile(filename, type, null, this.file, (msg, index, count) => {
                var p: number = ((index + 1) / count * 100) | 0;
                if (p > lastp || (index + 1) == count) {
                    console.debug(index + "/" + count + " " + p + "%");
                    lastp = p;
                }
                var elem = document.getElementById("myBar");
                elem.style.width = p + '%';
                elem.innerText = p + '%';
                if (p == 100) {
                    elem.innerText = 'Processing ...';
                }
            });
            var elem = document.getElementById("myBar");
            elem.style.width = '0%';
            elem.innerText = '';
            this.loading = false;
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
            this.loadData();
        }
    }
    export class EntitiesCtrl extends entitiesCtrl<openflow.Base> {
        public collections: any;
        constructor(
            public $scope: ng.IScope,
            public $location: ng.ILocationService,
            public $routeParams: ng.route.IRouteParamsService,
            public $interval: ng.IIntervalService,
            public WebSocketClient: WebSocketClient,
            public api: api,
            public userdata: userdata
        ) {
            super($scope, $location, $routeParams, $interval, WebSocketClient, api, userdata);
            console.debug("EntitiesCtrl");
            this.autorefresh = true;
            this.basequery = {};
            this.collection = $routeParams.collection;
            this.baseprojection = { _type: 1, type: 1, name: 1, _created: 1, _createdby: 1, _modified: 1 };
            this.postloadData = this.processdata;
            if (this.userdata.data.EntitiesCtrl) {
                this.basequery = this.userdata.data.EntitiesCtrl.basequery;
                this.collection = this.userdata.data.EntitiesCtrl.collection;
                this.baseprojection = this.userdata.data.EntitiesCtrl.baseprojection;
                this.orderby = this.userdata.data.EntitiesCtrl.orderby;
                this.searchstring = this.userdata.data.EntitiesCtrl.searchstring;
                this.basequeryas = this.userdata.data.EntitiesCtrl.basequeryas;
            }
            WebSocketClient.onSignedin(async (user: TokenUser) => {
                this.collections = await api.ListCollections();
                this.loadData();
            });
        }
        processdata() {
            if (!this.userdata.data.EntitiesCtrl) this.userdata.data.EntitiesCtrl = {};
            this.userdata.data.EntitiesCtrl.basequery = this.basequery;
            this.userdata.data.EntitiesCtrl.collection = this.collection;
            this.userdata.data.EntitiesCtrl.baseprojection = this.baseprojection;
            this.userdata.data.EntitiesCtrl.orderby = this.orderby;
            this.userdata.data.EntitiesCtrl.searchstring = this.searchstring;
            this.userdata.data.EntitiesCtrl.basequeryas = this.basequeryas;
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        SelectCollection() {
            this.userdata.data.EntitiesCtrl.collection = this.collection;
            this.$location.path("/Entities/" + this.collection);
            //this.$location.hash("#/Entities/" + this.collection);
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
            // this.loadData();
        }
        async DropCollection() {
            await this.api.DropCollection(this.collection);
            this.collections = await this.api.ListCollections();
            this.collection = "entities";
            this.loadData();
        }
        async DeleteOne(model: any): Promise<any> {
            this.loading = true;
            await this.api.Delete(this.collection, model);
            this.models = this.models.filter(function (m: any): boolean { return m._id !== model._id; });
            this.loading = false;
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        async DeleteMany(): Promise<void> {
            this.loading = true;
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
            var Promises: Promise<DeleteOneMessage>[] = [];
            var q: DeleteOneMessage = new DeleteOneMessage();
            this.models.forEach(model => {
                q.collectionname = this.collection; q._id = (model as any)._id;
                var msg: Message = new Message(); msg.command = "deleteone"; msg.data = JSON.stringify(q);
                Promises.push(this.WebSocketClient.Send(msg));
            });
            const results: any = await Promise.all(Promises.map(p => p.catch(e => e)));
            const values: DeleteOneMessage[] = results.filter(result => !(result instanceof Error));
            var ids: string[] = [];
            values.forEach((x: DeleteOneMessage) => ids.push(x._id));
            this.models = this.models.filter(function (m: any): boolean { return ids.indexOf(m._id) === -1; });
            this.loading = false;
            this.loadData();
            // if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
    }

    export class FormsCtrl extends entitiesCtrl<openflow.Base> {
        constructor(
            public $scope: ng.IScope,
            public $location: ng.ILocationService,
            public $routeParams: ng.route.IRouteParamsService,
            public $interval: ng.IIntervalService,
            public WebSocketClient: WebSocketClient,
            public api: api,
            public userdata: userdata
        ) {
            super($scope, $location, $routeParams, $interval, WebSocketClient, api, userdata);
            console.debug("FormsCtrl");
            this.autorefresh = true;
            this.collection = "forms";
            this.baseprojection = { _type: 1, type: 1, name: 1, _created: 1, _createdby: 1, _modified: 1 };
            WebSocketClient.onSignedin((user: TokenUser) => {
                this.loadData();
            });
        }
        async DeleteOne(model: any): Promise<any> {
            this.loading = true;
            await this.api.Delete(this.collection, model);
            this.models = this.models.filter(function (m: any): boolean { return m._id !== model._id; });
            this.loading = false;
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        async DeleteMany(): Promise<void> {
            this.loading = true;
            var Promises: Promise<DeleteOneMessage>[] = [];
            var q: DeleteOneMessage = new DeleteOneMessage();
            this.models.forEach(model => {
                q.collectionname = this.collection; q._id = (model as any)._id;
                var msg: Message = new Message(); msg.command = "deleteone"; msg.data = JSON.stringify(q);
                Promises.push(this.WebSocketClient.Send(msg));
            });
            const results: any = await Promise.all(Promises.map(p => p.catch(e => e)));
            const values: DeleteOneMessage[] = results.filter(result => !(result instanceof Error));
            var ids: string[] = [];
            values.forEach((x: DeleteOneMessage) => ids.push(x._id));
            this.models = this.models.filter(function (m: any): boolean { return ids.indexOf(m._id) === -1; });
            this.loading = false;
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
    }
    export class EditFormCtrl extends entityCtrl<openflow.Form> {
        public message: string = "";
        public charts: chartset[] = [];
        public formBuilder: any;
        public Formiobuilder: any;
        constructor(
            public $scope: ng.IScope,
            public $location: ng.ILocationService,
            public $routeParams: ng.route.IRouteParamsService,
            public $interval: ng.IIntervalService,
            public WebSocketClient: WebSocketClient,
            public api: api
        ) {
            super($scope, $location, $routeParams, $interval, WebSocketClient, api);
            console.debug("EditFormCtrl");
            this.collection = "forms";
            this.basequery = {};
            this.id = $routeParams.id;
            this.basequery = { _id: this.id };
            this.postloadData = this.renderform;
            this.
                WebSocketClient.onSignedin(async (user: TokenUser) => {
                    if (this.id !== null && this.id !== undefined && this.id !== "") {
                        this.basequery = { _id: this.id };
                        this.loadData();
                    } else {
                        this.model = new openflow.Form();
                        this.model.fbeditor = false;
                        this.renderform();
                    }

                });
        }
        async Save() {
            if (this.model.fbeditor == true) {
                this.model.formData = this.formBuilder.actions.getData(this.model.dataType);
            } else {
                // allready there
            }
            if (this.model._id) {
                this.model = await this.api.Update(this.collection, this.model);
            } else {
                this.model = await this.api.Insert(this.collection, this.model);
            }
            this.$location.path("/Forms");
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        async renderform() {
            if (this.model.fbeditor == null || this.model.fbeditor == undefined) this.model.fbeditor = true;
            if ((this.model.fbeditor as any) == "true") this.model.fbeditor = true;
            if ((this.model.fbeditor as any) == "false") this.model.fbeditor = false;
            if (this.model.fbeditor == true) {
                // https://www.npmjs.com/package/angular2-json-schema-form
                // http://www.alpacajs.org/demos/form-builder/form-builder.html
                // https://github.com/kevinchappell/formBuilder - https://formbuilder.online/ - https://kevinchappell.github.io/formBuilder/
                var ele: any;
                var roles: any = {};
                this.WebSocketClient.user.roles.forEach(role => {
                    roles[role._id] = role.name;
                });

                var fbOptions = {
                    formData: this.model.formData,
                    dataType: this.model.dataType,
                    roles: roles,
                    disabledActionButtons: ['data', 'clear'],
                    onSave: this.Save.bind(this),
                };
                ele = $(document.getElementById('fb-editor'));
                if (this.formBuilder == null || this.formBuilder == undefined) {
                    this.formBuilder = await ele.formBuilder(fbOptions).promise;
                }
            } else {
                if (this.model.formData == null || this.model.formData == undefined) { this.model.formData = {}; }
                // "https://examples.form.io/wizard"
                if (this.model.wizard == true) {
                    this.model.formData.display = "wizard";
                } else {
                    this.model.formData.display = "form";
                }
                this.Formiobuilder = await Formio.builder(document.getElementById('builder'), this.model.formData,
                    {
                        noAlerts: false,
                        breadcrumbSettings: { clickable: false },
                        buttonSettings: { showCancel: false },
                        builder: {
                            data: false,
                            premium: false
                        }
                    });
                this.Formiobuilder.on('change', form => {
                    this.model.schema = form;
                })
                this.Formiobuilder.on('submit', submission => {
                })
                this.Formiobuilder.on('error', (errors) => {
                    console.error(errors);
                })
            }
            this.loading = false;
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
    }
    export class FormCtrl extends entityCtrl<openflow.WorkflowInstance> {
        public message: string = "";
        public formRender: any;
        public formioRender: any;
        public workflow: openflow.Workflow;
        public form: openflow.Form;
        public instanceid: string;
        public myid: string;
        public submitbutton: string;
        public queuename: string;
        public queue_message_timeout: number = (60 * 1000); // 1 min

        constructor(
            public $scope: ng.IScope,
            public $location: ng.ILocationService,
            public $routeParams: ng.route.IRouteParamsService,
            public $interval: ng.IIntervalService,
            public WebSocketClient: WebSocketClient,
            public api: api
        ) {
            super($scope, $location, $routeParams, $interval, WebSocketClient, api);
            this.myid = new Date().toISOString();
            console.debug("FormCtrl");
            this.collection = "workflow";
            this.basequery = {};
            this.id = $routeParams.id;
            this.instanceid = $routeParams.instance;

            this.basequery = { _id: this.id };
            WebSocketClient.onSignedin(async (user: TokenUser) => {
                this.queuename = await api.RegisterQueue();
                console.log(this.queuename);
                if (this.id !== null && this.id !== undefined && this.id !== "") {
                    this.basequery = { _id: this.id };
                    this.loadData();
                } else {
                    this.errormessage = "missing id";
                    if (!this.$scope.$$phase) { this.$scope.$apply(); }
                    console.error(this.errormessage);
                }
            });
            $scope.$on('queuemessage', (event, data: QueueMessage) => {
                if (event && data) { }
                console.debug(data);
                if (data.queuename == this.queuename) {
                    if (this.instanceid == null && data.data._id != null) {
                        this.instanceid = data.data._id;
                        // this.$location.path("/Form/" + this.id + "/" + this.instanceid);
                        // if (!this.$scope.$$phase) { this.$scope.$apply(); }
                        this.loadData();
                        return;
                    } else {
                        this.loadData();
                    }
                }
                if (!this.$scope.$$phase) { this.$scope.$apply(); }
            });

        }
        async loadData(): Promise<void> {
            this.loading = true;
            var res = await this.api.Query(this.collection, this.basequery, null, { _created: -1 }, 1);
            if (res.length > 0) { this.workflow = res[0]; } else {
                this.errormessage = this.id + " workflow not found!";
                if (!this.$scope.$$phase) { this.$scope.$apply(); }
                console.error(this.errormessage);
                return;
            }
            if (this.instanceid !== null && this.instanceid !== undefined && this.instanceid !== "") {
                var res = await this.api.Query("workflow_instances", { _id: this.instanceid }, null, { _created: -1 }, 1);
                if (res.length > 0) { this.model = res[0]; } else {
                    this.errormessage = this.id + " workflow instances not found!";
                    if (!this.$scope.$$phase) { this.$scope.$apply(); }
                    console.error(this.errormessage);
                    return;
                }
                // console.debug(this.model);
                // console.debug(this.model.form);
                // console.debug("form: " + this.model.form);
                if (this.model.payload === null || this.model.payload === undefined) {
                    this.model.payload = { _id: this.instanceid };
                }
                if (typeof this.model.payload !== "object") {
                    this.model.payload = { message: this.model.payload, _id: this.instanceid };
                }


                if (this.model.form === "none" || this.model.form === "") {
                    this.$location.path("/main");
                    if (!this.$scope.$$phase) { this.$scope.$apply(); }
                    return;
                } else if (this.model.form === "unknown") {
                    console.debug("Form is unknown for instance, send empty message");
                    this.Save();
                    return;
                } else if (this.model.form !== "") {
                    var res = await this.api.Query("forms", { _id: this.model.form }, null, { _created: -1 }, 1);
                    if (res.length > 0) { this.form = res[0]; } else {
                        if (this.model.state == "completed") {
                            this.$location.path("/main");
                            if (!this.$scope.$$phase) { this.$scope.$apply(); }
                            return;
                        } else {
                            this.errormessage = this.model.form + " form not found! " + this.model.state;
                            if (!this.$scope.$$phase) { this.$scope.$apply(); }
                            console.error(this.errormessage);
                            return;
                        }
                    }
                } else {
                    // this.errormessage = "Model contains no form";
                    // if (!this.$scope.$$phase) { this.$scope.$apply(); }
                    // console.error(this.errormessage);
                }
                this.renderform();
            } else {
                console.debug("No instance id found, send empty message");
                console.debug("SendOne: " + this.workflow._id + " / " + this.workflow.queue);
                await this.SendOne(this.workflow.queue, {});
                this.loadData();
            }
        }
        async SendOne(queuename: string, message: any): Promise<void> {
            // console.debug("SendOne: queuename " + queuename + " / " + this.myid);
            var result: any = await this.api.QueueMessage(queuename, this.queuename, message, this.queue_message_timeout);
            try {
                result = JSON.parse(result);
            } catch (error) {
                this.errormessage = "Model contains no form";
                if (!this.$scope.$$phase) { this.$scope.$apply(); }
                console.error(this.errormessage);
            }
            // console.debug(result);
            // if ((this.instanceid === undefined || this.instanceid === null) && (result !== null && result !== unescape)) {
            //     this.instanceid = result._id;
            //     this.$location.path("/Form/" + this.id + "/" + this.instanceid);
            //     if (!this.$scope.$$phase) { this.$scope.$apply(); }
            // }
        }
        async Save() {
            if (this.form !== null && this.form !== undefined && this.form.fbeditor === true) {
                var userData: any[] = this.formRender.userData;
                if (this.model.payload === null || this.model.payload === undefined) { this.model.payload = {}; }
                for (var i = 0; i < userData.length; i++) {
                    this.model.payload[userData[i].name] = "";
                    var val = userData[i].userData;
                    if (val !== undefined && val !== null) {
                        if (userData[i].type == "checkbox-group") {
                            this.model.payload[userData[i].name] = val;
                        } else if (Array.isArray(val)) {
                            this.model.payload[userData[i].name] = val[0];
                        } else {
                            this.model.payload[userData[i].name] = val;
                        }
                    }
                }
                this.model.payload.submitbutton = this.submitbutton;
                var ele = $('.render-wrap');
                ele.hide();
            } else {

            }
            // console.debug("SendOne: " + this.workflow._id + " / " + this.workflow.queue);
            this.model.payload._id = this.instanceid;
            await this.SendOne(this.workflow.queue, this.model.payload);
            this.loadData();
        }
        traversecomponentsPostProcess(components: any[], data: any) {
            for (var i = 0; i < components.length; i++) {
                var item = components[i];
                if (item.type == "button" && item.action == "submit") {
                    if (data[item.key] == true) {
                        this.submitbutton = item.key;
                        this.model.payload.submitbutton = item.key;
                    }
                }
            }

            for (var i = 0; i < components.length; i++) {
                var item = components[i];
                if (item.type == "table") {
                    for (var x = 0; x < item.rows.length; x++) {
                        for (var y = 0; y < item.rows[x].length; y++) {
                            var subcomponents = item.rows[x][y].components;
                            this.traversecomponentsPostProcess(subcomponents, data);
                        }

                    }
                }
            }

        }
        traversecomponentsMakeDefaults(components: any[]) {
            for (var y = 0; y < components.length; y++) {
                var item = components[y];
                if (item.type == "datagrid") {
                    if (this.model.payload[item.key] === null || this.model.payload[item.key] === undefined) {
                        var obj: any = {};
                        for (var x = 0; x < item.components.length; x++) {
                            obj[item.components[x].key] = "";
                        }
                        console.debug("add default array for " + item.key, obj);
                        this.model.payload[item.key] = [obj];
                    } else {
                        console.debug("payload already have values for " + item.key);
                        console.debug("isArray: " + Array.isArray(this.model.payload[item.key]))
                        if (Array.isArray(this.model.payload[item.key])) {
                        } else {
                            console.debug("convert payload for " + item.key + " from object to array");
                            var keys = Object.keys(this.model.payload[item.key]);
                            var arr: any[] = [];
                            for (var x = 0; x < keys.length; x++) {
                                arr.push(this.model.payload[item.key][keys[x]]);
                            }
                            this.model.payload[item.key] = arr;
                        }
                    }
                }
                if (item.type == "button" && item.action == "submit") {
                    this.model.payload[item.key] = false;
                }
            }
            if (this.model.payload != null && this.model.payload != undefined) {
                if (this.model.payload.values != null && this.model.payload.values != undefined) {
                    var keys = Object.keys(this.model.payload.values);
                }
            }
            if (this.model.payload != null && this.model.payload != undefined) {
                if (this.model.payload.values != null && this.model.payload.values != undefined) {
                    var keys = Object.keys(this.model.payload.values);
                    for (var i = 0; i < keys.length; i++) {
                        var values = this.model.payload.values[keys[i]];
                        for (var y = 0; y < components.length; y++) {
                            var item = components[y];
                            if (item.key == keys[i]) {
                                if (Array.isArray(values)) {
                                    console.debug("handle " + item.key + " as array");
                                    var obj2: any = {};
                                    for (var x = 0; x < values.length; x++) {
                                        obj2[x] = values[x];
                                    }
                                    if (item.data != null && item.data != undefined) {
                                        item.data.values = obj2;
                                        item.data.json = JSON.stringify(values);
                                        // console.debug("Setting values for " + keys[i], JSON.stringify(obj));
                                    } else {
                                        item.values = values;
                                    }
                                } else {
                                    console.debug("handle " + item.key + " as an object");
                                    if (item.data != null && item.data != undefined) {
                                        item.data.values = values;
                                        item.data.json = JSON.stringify(values);
                                        // console.debug("Setting values for " + keys[i], JSON.stringify(values));
                                    } else {
                                        item.values = values;
                                    }
                                }
                                // if (item.data != null && item.data != undefined) {
                                //     console.debug(keys[i], item.data);
                                // } else {
                                //     console.debug(keys[i], item);
                                // }
                            }
                        }

                    }
                }
            }

            for (var i = 0; i < components.length; i++) {
                var item = components[i];
                if (item.type == "table") {
                    for (var x = 0; x < item.rows.length; x++) {
                        for (var y = 0; y < item.rows[x].length; y++) {
                            var subcomponents = item.rows[x][y].components;
                            this.traversecomponentsMakeDefaults(subcomponents);
                        }

                    }
                }
            }

            // rows
        }
        sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
        async beforeSubmit(submission, next) {
            next();
        }
        async renderform() {
            if (this.form.fbeditor == null || this.form.fbeditor == undefined) this.form.fbeditor = true;
            if ((this.form.fbeditor as any) == "true") this.form.fbeditor = true;
            if ((this.form.fbeditor as any) == "false") this.form.fbeditor = false;
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
            if (this.form.fbeditor === true) {
                console.debug("renderform");
                var ele: any;
                var roles: any = {};
                this.WebSocketClient.user.roles.forEach(role => {
                    roles[role._id] = role.name;
                });
                if (typeof this.form.formData === 'string' || this.form.formData instanceof String) {
                    this.form.formData = JSON.parse((this.form.formData as any));
                }
                for (var i = 0; i < this.form.formData.length; i++) {
                    var value = this.model.payload[this.form.formData[i].name];
                    if (value == undefined || value == null) { value = ""; }
                    if (value != "" || this.form.formData[i].type != "button") {
                        // console.debug("0:" + this.form.formData[i].label + " -> " + value);
                        this.form.formData[i].userData = [value];
                    }
                    if (Array.isArray(value)) {
                        // console.debug("1:" + this.form.formData[i].userData + " -> " + value);
                        this.form.formData[i].userData = value;
                    }
                    if (this.model.payload[this.form.formData[i].label] !== null && this.model.payload[this.form.formData[i].label] !== undefined) {
                        value = this.model.payload[this.form.formData[i].label];
                        if (value == undefined || value == null) { value = ""; }
                        if (this.form.formData[i].type != "button") {
                            // console.debug("2:" + this.form.formData[i].label + " -> " + value);
                            this.form.formData[i].label = value;
                        } else if (value != "") {
                            // console.debug("2button:" + this.form.formData[i].label + " -> " + value);
                            this.form.formData[i].label = value;
                        } else {
                            // console.debug("skip " + this.form.formData[i].label);
                        }
                    }
                    if (this.model.values !== null && this.model.values !== undefined) {
                        if (this.model.values[this.form.formData[i].name] !== null && this.model.values[this.form.formData[i].name] !== undefined) {
                            value = this.model.values[this.form.formData[i].name];
                            if (value == undefined || value == null) { value = []; }
                            // console.debug("3:" + this.form.formData[i].values + " -> " + value);
                            this.form.formData[i].values = value;
                        }
                    }
                }
                var formRenderOpts = {
                    formData: this.form.formData,
                    dataType: this.form.dataType,
                    roles: roles,
                    disabledActionButtons: ['data', 'clear'],
                    onSave: this.Save.bind(this),
                };
                if (this.model.userData !== null && this.model.userData !== undefined && this.model.userData !== "") {
                    formRenderOpts.formData = this.model.userData;
                }
                var concatHashToString = function (hash) {
                    var emptyStr = '';
                    $.each(hash, function (index) {
                        emptyStr += ' ' + hash[index].name + '="' + hash[index].value + '"';
                    });
                    return emptyStr;
                }
                var replaceElem = function (targetId, replaceWith) {
                    $(targetId).each(function () {
                        var attributes = concatHashToString(this.attributes);
                        var replacingStartTag = '<' + replaceWith + attributes + '>';
                        var replacingEndTag = '</' + replaceWith + '>';
                        $(this).replaceWith(replacingStartTag + $(this).html() + replacingEndTag);
                    });
                }
                var replaceElementTag = function (targetSelector, newTagString) {
                    $(targetSelector).each(function () {
                        var newElem = $(newTagString, { html: $(this).html() });
                        $.each(this.attributes, function () {
                            newElem.attr(this.name, this.value);
                        });
                        $(this).replaceWith(newElem);
                    });
                }

                setTimeout(() => {
                    console.debug("Attach buttons! 2");
                    $('button[type="button"]').each(function () {
                        var cur: any = $(this)[0];
                        console.debug("set submit");
                        cur.type = "submit";
                    });
                    var click = function (evt) {
                        this.submitbutton = evt.target.id;
                    }
                    $('button[type="submit"]').click(click.bind(this));

                }, 500);
                ele = $('.render-wrap');
                ele.show();
                this.formRender = ele.formRender(formRenderOpts);
            } else {

                this.traversecomponentsMakeDefaults(this.form.schema.components);

                if (this.form.wizard == true) {
                    this.form.schema.display = "wizard";
                } else {
                    this.form.schema.display = "form";
                }

                this.formioRender = await Formio.createForm(document.getElementById('formio'), this.form.schema,
                    {
                        breadcrumbSettings: { clickable: true },
                        buttonSettings: { showCancel: false },
                        hooks: {
                            beforeSubmit: this.beforeSubmit.bind(this)
                        }
                    });
                // wizard
                this.formioRender.on('change', form => {
                    //console.debug('change', form);
                    // setTimeout(() => {
                    //     this.formioRender.submit();
                    // }, 200);

                    // this.model.schema = form;
                    // if (!this.$scope.$$phase) { this.$scope.$apply(); }
                })
                // https://formio.github.io/formio.js/app/examples/datagrid.html

                if (this.model.payload != null && this.model.payload != undefined) {
                    this.formioRender.submission = { data: this.model.payload };
                }
                this.formioRender.on('submit', async submission => {
                    console.debug('onsubmit', submission);
                    $(".alert-success").hide();
                    setTimeout(() => {
                        // just to be safe
                        $(".alert-success").hide();
                    }, 200);
                    this.model.submission = submission;
                    this.model.userData = submission;
                    this.model.payload = submission.data;
                    this.traversecomponentsPostProcess(this.form.schema.components, submission.data);
                    this.Save();
                })
                this.formioRender.on('error', (errors) => {
                    this.errormessage = errors;
                    if (!this.$scope.$$phase) { this.$scope.$apply(); }
                    console.error(this.errormessage);
                });
            }
            if (this.model.state == "completed" || this.model.state == "failed") {
                $('#workflowform :input').prop("disabled", true);
                $('#workflowform :button').prop("disabled", true);
                $('#workflowform :input').addClass("disabled");
                $('#workflowform :button').addClass("disabled");

                $('#workflowform :button').hide();
                $('input[type="submit"]').hide();
                if (this.model.state == "failed") {
                    if ((this.model as any).error != null && (this.model as any).error != "") {
                        this.errormessage = (this.model as any).error;
                    } else if (!this.model.payload) {
                        this.errormessage = "An unknown error occurred";
                    } else if (this.model.payload.message != null && this.model.payload.message != "") {
                        this.errormessage = this.model.payload.message;
                    } else if (this.model.payload.Message != null && this.model.payload.Message != "") {
                        this.errormessage = this.model.payload.Message;
                    } else {
                        this.errormessage = this.model.payload;
                    }
                    console.log(this.model.payload);
                }
            }
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }

    }
    export class jslogCtrl extends entitiesCtrl<openflow.Base> {
        public message: string = "";
        public charts: chartset[] = [];
        constructor(
            public $scope: ng.IScope,
            public $location: ng.ILocationService,
            public $routeParams: ng.route.IRouteParamsService,
            public $interval: ng.IIntervalService,
            public WebSocketClient: WebSocketClient,
            public api: api,
            public userdata: userdata
        ) {
            super($scope, $location, $routeParams, $interval, WebSocketClient, api, userdata);
            this.autorefresh = true;
            console.debug("jslogCtrl");
            this.searchfields = ["_createdby", "host", "message"];
            this.collection = "jslog";
            this.basequery = {};
            this.orderby = { _created: -1 };
            this.baseprojection = { _type: 1, type: 1, host: 1, message: 1, name: 1, _created: 1, _createdby: 1, _modified: 1 };
            WebSocketClient.onSignedin((user: TokenUser) => {
                this.loadData();
            });
        }
        async DeleteMany(): Promise<void> {
            this.loading = true;
            var Promises: Promise<DeleteOneMessage>[] = [];
            var q: DeleteOneMessage = new DeleteOneMessage();
            this.models.forEach(model => {
                q.collectionname = this.collection; q._id = (model as any)._id;
                var msg: Message = new Message(); msg.command = "deleteone"; msg.data = JSON.stringify(q);
                Promises.push(this.WebSocketClient.Send(msg));
            });
            const results: any = await Promise.all(Promises.map(p => p.catch(e => e)));
            const values: DeleteOneMessage[] = results.filter(result => !(result instanceof Error));
            var ids: string[] = [];
            values.forEach((x: DeleteOneMessage) => ids.push(x._id));
            this.models = this.models.filter(function (m: any): boolean { return ids.indexOf(m._id) === -1; });
            this.loading = false;

            this.models = await this.api.Query(this.collection, this.basequery, this.baseprojection, this.orderby);
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
            if (this.models.length > 0) {
                await this.DeleteMany();
            }
        }

    }


    export class EntityCtrl extends entityCtrl<openflow.Base> {
        searchFilteredList: openflow.TokenUser[] = [];
        searchSelectedItem: openflow.TokenUser = null;
        searchtext: string = "";
        e: any = null;

        public newkey: string = "";
        public showjson: boolean = false;
        public jsonmodel: string = "";
        public message: string = "";
        constructor(
            public $scope: ng.IScope,
            public $location: ng.ILocationService,
            public $routeParams: ng.route.IRouteParamsService,
            public $interval: ng.IIntervalService,
            public WebSocketClient: WebSocketClient,
            public api: api
        ) {
            super($scope, $location, $routeParams, $interval, WebSocketClient, api);
            console.debug("EntityCtrl");
            this.collection = $routeParams.collection;
            this.postloadData = this.processdata;
            WebSocketClient.onSignedin(async (user: TokenUser) => {
                // this.usergroups = await this.api.Query("users", {});
                if (this.id !== null && this.id !== undefined) {
                    await this.loadData();
                } else {
                    this.model = new openflow.Base();
                    this.model._type = "test";
                    this.model.name = "new item";
                    this.model._encrypt = [];
                    this.model._acl = [];
                    this.keys = Object.keys(this.model);
                    for (var i: number = this.keys.length - 1; i >= 0; i--) {
                        if (this.keys[i].startsWith('_')) this.keys.splice(i, 1);
                    }
                    this.processdata();
                    //if (!this.$scope.$$phase) { this.$scope.$apply(); }
                }
            });
        }
        processdata() {
            var ids: string[] = [];
            if (this.collection == "files") {
                for (var i: number = 0; i < (this.model as any).metadata._acl.length; i++) {
                    ids.push((this.model as any).metadata._acl[i]._id);
                }
            } else {
                for (var i: number = 0; i < this.model._acl.length; i++) {
                    ids.push(this.model._acl[i]._id);
                }
            }
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
            this.fixtextarea();
        }
        fixtextarea() {
            setTimeout(() => {
                var tx = document.getElementsByTagName('textarea');
                for (var i = 0; i < tx.length; i++) {
                    tx[i].setAttribute('style', 'height:' + (tx[i].scrollHeight) + 'px;overflow-y:hidden;');
                    tx[i].addEventListener("input", OnInput, false);
                }

                function OnInput() {
                    this.style.height = 'auto';
                    this.style.height = (this.scrollHeight) + 'px';
                }

            }, 500);
        }
        togglejson() {
            this.showjson = !this.showjson;
            if (this.showjson) {
                this.jsonmodel = JSON.stringify(this.model, null, 2);
            } else {
                this.model = JSON.parse(this.jsonmodel);
                this.keys = Object.keys(this.model);
                for (var i: number = this.keys.length - 1; i >= 0; i--) {
                    if (this.keys[i].startsWith('_')) this.keys.splice(i, 1);
                }
            }
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
            this.fixtextarea();
        }
        async submit(): Promise<void> {
            if (this.showjson) {
                try {
                    this.model = JSON.parse(this.jsonmodel);
                } catch (error) {
                    this.message = error;
                    if (!this.$scope.$$phase) { this.$scope.$apply(); }
                    return;
                }
            }
            if (this.model._id) {
                await this.api.Update(this.collection, this.model);
            } else {
                await this.api.Insert(this.collection, this.model);
            }
            if (this.collection == "files") {
                this.$location.path("/Files");
                if (!this.$scope.$$phase) { this.$scope.$apply(); }
                return;
            }
            this.$location.path("/Entities/" + this.collection);
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        removekey(key) {
            if (this.keys.indexOf(key) > -1) {
                this.keys.splice(this.keys.indexOf(key), 1);
            }
            delete this.model[key];
        }
        addkey() {
            if (this.newkey === '') { return; }
            if (this.keys.indexOf(this.newkey) > -1) {
                this.keys.splice(this.keys.indexOf(this.newkey), 1);
            }
            this.keys.push(this.newkey);
            this.model[this.newkey] = '';
            this.newkey = '';
        }
        removeuser(_id) {
            if (this.collection == "files") {
                for (var i = 0; i < (this.model as any).metadata._acl.length; i++) {
                    if ((this.model as any).metadata._acl[i]._id == _id) {
                        (this.model as any).metadata._acl.splice(i, 1);
                    }
                }
            } else {
                for (var i = 0; i < this.model._acl.length; i++) {
                    if (this.model._acl[i]._id == _id) {
                        this.model._acl.splice(i, 1);
                        //this.model._acl = this.model._acl.splice(index, 1);
                    }
                }
            }

        }
        adduser() {
            var ace = new Ace();
            ace.deny = false;
            ace._id = this.searchSelectedItem._id;
            ace.name = this.searchSelectedItem.name;
            ace.rights = "//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////8=";

            if (this.collection == "files") {
                (this.model as any).metadata._acl.push(ace);
            } else {
                this.model._acl.push(ace);
            }
            this.searchSelectedItem = null;
            this.searchtext = "";
        }

        isBitSet(base64: string, bit: number): boolean {
            bit--;
            var buf = this._base64ToArrayBuffer(base64);
            var view = new Uint8Array(buf);
            var octet = Math.floor(bit / 8);
            var currentValue = view[octet];
            var _bit = (bit % 8);
            var mask = Math.pow(2, _bit);
            return (currentValue & mask) != 0;
        }
        setBit(base64: string, bit: number) {
            bit--;
            var buf = this._base64ToArrayBuffer(base64);
            var view = new Uint8Array(buf);
            var octet = Math.floor(bit / 8);
            var currentValue = view[octet];
            var _bit = (bit % 8);
            var mask = Math.pow(2, _bit);
            var newValue = currentValue | mask;
            view[octet] = newValue;
            return this._arrayBufferToBase64(view);
        }
        unsetBit(base64: string, bit: number) {
            bit--;
            var buf = this._base64ToArrayBuffer(base64);
            var view = new Uint8Array(buf);
            var octet = Math.floor(bit / 8);
            var currentValue = view[octet];
            var _bit = (bit % 8);
            var mask = Math.pow(2, _bit);
            var newValue = currentValue &= ~mask;
            view[octet] = newValue;
            return this._arrayBufferToBase64(view);
        }
        toogleBit(a: any, bit: number) {
            if (this.isBitSet(a.rights, bit)) {
                a.rights = this.unsetBit(a.rights, bit);
            } else {
                a.rights = this.setBit(a.rights, bit);
            }
            var buf2 = this._base64ToArrayBuffer(a.rights);
            var view2 = new Uint8Array(buf2);
        }
        _base64ToArrayBuffer(string_base64): ArrayBuffer {
            var binary_string = window.atob(string_base64);
            var len = binary_string.length;
            var bytes = new Uint8Array(len);
            for (var i = 0; i < len; i++) {
                //var ascii = string_base64.charCodeAt(i);
                var ascii = binary_string.charCodeAt(i);
                bytes[i] = ascii;
            }
            return bytes.buffer;
        }
        _arrayBufferToBase64(array_buffer): string {
            var binary = '';
            var bytes = new Uint8Array(array_buffer);
            var len = bytes.byteLength;
            for (var i = 0; i < len; i++) {
                binary += String.fromCharCode(bytes[i])
            }
            return window.btoa(binary);
        }




        restrictInput(e) {
            if (e.keyCode == 13) {
                e.preventDefault();
                return false;
            }
        }
        setkey(e) {
            this.e = e;
            this.handlekeys();
        }
        handlekeys() {
            if (this.searchFilteredList.length > 0) {
                var idx: number = -1;
                for (var i = 0; i < this.searchFilteredList.length; i++) {
                    if (this.searchSelectedItem != null) {
                        if (this.searchFilteredList[i]._id == this.searchSelectedItem._id) {
                            idx = i;
                        }
                    }
                }
                if (this.e.keyCode == 38) { // up
                    if (idx <= 0) {
                        idx = 0;
                    } else { idx--; }
                    console.debug("idx: " + idx);
                    // this.searchtext = this.searchFilteredList[idx].name;
                    this.searchSelectedItem = this.searchFilteredList[idx];
                    return;
                }
                else if (this.e.keyCode == 40) { // down
                    if (idx >= this.searchFilteredList.length) {
                        idx = this.searchFilteredList.length - 1;
                    } else { idx++; }
                    console.debug("idx: " + idx);
                    // this.searchtext = this.searchFilteredList[idx].name;
                    this.searchSelectedItem = this.searchFilteredList[idx];
                    return;
                }
                else if (this.e.keyCode == 13) { // enter
                    if (idx >= 0) {
                        this.searchtext = this.searchFilteredList[idx].name;
                        this.searchSelectedItem = this.searchFilteredList[idx];
                        this.searchFilteredList = [];
                        if (!this.$scope.$$phase) { this.$scope.$apply(); }
                    }
                    return;
                }
                else {
                    // console.debug(this.e.keyCode);
                }
            } else {
                if (this.e.keyCode == 13 && this.searchSelectedItem != null) {
                    this.adduser();
                }
            }
        }
        async handlefilter(e) {
            this.e = e;
            // console.debug(e.keyCode);
            var ids: string[];
            if (this.collection == "files") {
                ids = (this.model as any).metadata._acl.map(item => item._id);
            } else {
                ids = this.model._acl.map(item => item._id);
            }
            this.searchFilteredList = await this.api.Query("users",
                {
                    $and: [
                        { $or: [{ _type: "user" }, { _type: "role" }] },
                        { name: new RegExp([this.searchtext].join(""), "i") },
                        { _id: { $nin: ids } }
                    ]
                }
                , null, { _type: -1, name: 1 }, 5);
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        fillTextbox(searchtext) {
            this.searchFilteredList.forEach((item: any) => {
                if (item.name.toLowerCase() == searchtext.toLowerCase()) {
                    this.searchtext = item.name;
                    this.searchSelectedItem = item;
                    this.searchFilteredList = [];
                    if (!this.$scope.$$phase) { this.$scope.$apply(); }
                }
            });
        }

    }

    export class HistoryCtrl extends entitiesCtrl<openflow.Base> {
        public id: string = "";
        public model: openflow.Base;
        constructor(
            public $scope: ng.IScope,
            public $location: ng.ILocationService,
            public $routeParams: ng.route.IRouteParamsService,
            public $interval: ng.IIntervalService,
            public WebSocketClient: WebSocketClient,
            public api: api,
            public userdata: userdata
        ) {
            super($scope, $location, $routeParams, $interval, WebSocketClient, api, userdata);
            this.autorefresh = true;
            console.debug("HistoryCtrl");
            this.id = $routeParams.id;
            this.basequery = { _id: this.id };
            this.collection = $routeParams.collection;
            this.baseprojection = null;
            this.postloadData = this.ProcessData;
            WebSocketClient.onSignedin((user: TokenUser) => {
                this.loadData();
            });
        }
        async ProcessData() {
            // this.models = await this.api.Query(this.collection, { _id: this.id }, null, null);
            this.model = this.models[0];
            var keys = Object.keys(this.model);
            keys.forEach(key => {
                if (key.startsWith("_")) {
                    delete this.model[key];
                }
            });
            this.models = await this.api.Query(this.collection + "_hist", { id: this.id }, { name: 1, _createdby: 1, _modified: 1, _version: 1 }, this.orderby);
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        async CompareNow(model) {
            var modal: any = $("#exampleModal");
            modal.modal()
            // var delta = jsondiffpatch.diff(this.model, model.item);
            if (model.item == null) {
                var items = await this.api.Query(this.collection + "_hist", { _id: model._id }, null, this.orderby);
                if (items.length > 0) {
                    model.item = items[0].item;
                    model.delta = items[0].delta;
                }
            }
            var keys = Object.keys(model.item);
            keys.forEach(key => {
                if (key.startsWith("_")) {
                    delete model.item[key];
                }
            });

            var delta = jsondiffpatch.diff(model.item, this.model);
            document.getElementById('visual').innerHTML = jsondiffpatch.formatters.html.format(delta, this.model);
        }
        async CompareThen(model) {
            if (model.item == null || model.delta == null) {
                var items = await this.api.Query(this.collection + "_hist", { _id: model._id }, null, this.orderby);
                if (items.length > 0) {
                    model.item = items[0].item;
                    model.delta = items[0].delta;
                }
            }
            var modal: any = $("#exampleModal");
            modal.modal();
            document.getElementById('visual').innerHTML = jsondiffpatch.formatters.html.format(model.delta, model.item);
        }
        async RevertTo(model) {
            if (model.item == null) {
                var items = await this.api.Query(this.collection + "_hist", { _id: model._id }, null, this.orderby);
                if (items.length > 0) {
                    model.item = items[0].item;
                    model.delta = items[0].delta;
                }
            }
            let result = window.confirm("Overwrite current version with version " + model._version + "?");
            if (result) {
                jsondiffpatch.patch(model.item, model.delta);
                model.item._id = this.id;
                await this.api.Update(this.collection, model.item);
                this.loadData();
            }
        }
    }

    export class NoderedCtrl {
        public static $inject = [
            "$scope",
            "$location",
            "$routeParams",
            "WebSocketClient",
            "api"
        ];
        public messages: string = "";
        public errormessage: string = "";
        public queuename: string = "webtest";
        public noderedurl: string = "";
        public instance: any = null;
        public instances: any[] = null;
        public instancestatus: string = "";
        public instancelog: string = "";
        public name: string = "";
        public instancename: string = "";
        public userid: string = "";
        public user: NoderedUser = null;
        public limitsmemory: string = "";
        public loading: boolean = false;
        constructor(
            public $scope: ng.IScope,
            public $location: ng.ILocationService,
            public $routeParams: ng.route.IRouteParamsService,
            public WebSocketClient: WebSocketClient,
            public api: api
        ) {
            console.debug("NoderedCtrl");
            WebSocketClient.onSignedin(async (user: TokenUser) => {
                this.loading = true;
                await api.RegisterQueue();
                this.userid = $routeParams.id;
                if (this.userid == null || this.userid == undefined || this.userid == "") {
                    this.name = WebSocketClient.user.username;
                    this.userid = WebSocketClient.user._id;
                    var users: NoderedUser[] = await this.api.Query("users", { _id: this.userid }, null, null, 1);
                    this.user = NoderedUser.assign(users[0]);
                    this.name = users[0].username;
                } else {
                    var users: NoderedUser[] = await this.api.Query("users", { _id: this.userid }, null, null, 1);
                    if (users.length == 0) {
                        this.instancestatus = "Unknown id!";
                        return;
                    }
                    this.user = NoderedUser.assign(users[0]);
                    this.name = users[0].username;
                }
                if (this.user.nodered != null && this.user.nodered.resources != null && this.user.nodered.resources.limits != null) {
                    this.limitsmemory = this.user.nodered.resources.limits.memory;
                }
                this.name = this.name.split("@").join("").split(".").join("");
                this.name = this.name.toLowerCase();
                this.noderedurl = "https://" + WebSocketClient.nodered_domain_schema.replace("$nodered_id$", this.name);
                // // this.GetNoderedInstance();
                this.GetNoderedInstance();
            });
        }
        async save() {
            try {
                this.errormessage = "";
                if (this.limitsmemory != "") {
                    if (this.user.nodered == null) this.user.nodered = new noderedconfig();
                    if (this.user.nodered.resources == null) this.user.nodered.resources = new resources();
                    if (this.user.nodered.resources.limits == null) this.user.nodered.resources.limits = new resourcevalues();
                    if (this.user.nodered.resources.limits.memory != this.limitsmemory) {
                        this.user.nodered.resources.limits.memory = this.limitsmemory;
                    }
                } else {
                    if (this.user.nodered != null && this.user.nodered.resources != null && this.user.nodered.resources.limits != null) {
                        if (this.limitsmemory != this.user.nodered.resources.limits.memory) {
                            this.user.nodered.resources.limits.memory = this.limitsmemory;
                        }
                    }
                }
                this.loading = true;
                this.messages += 'Updating ' + this.user.name + "\n";
                if (!this.$scope.$$phase) { this.$scope.$apply(); }
                await this.api.Update("users", this.user);
                this.loading = false;
                this.messages += 'update complete\n';
                this.EnsureNoderedInstance();
            } catch (error) {
                this.errormessage = error;
            }
            this.loading = false;
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        async GetNoderedInstance() {
            try {
                this.errormessage = "";
                this.instancestatus = "fetching status";

                this.instances = await this.api.GetNoderedInstance(this.userid, null);
                if (this.instances != null && this.instances.length > 0) {
                    this.instance = this.instances[0];
                }

                console.debug("GetNoderedInstance:");
                if (this.instance !== null && this.instance !== undefined) {
                    if (this.instance.metadata.deletionTimestamp !== undefined) {
                        this.instancestatus = "pending deletion (" + this.instance.status.phase + ")";
                    } else {
                        this.instancestatus = this.instance.status.phase;
                    }
                } else {
                    this.instancestatus = "non existent";
                    // this.messages += "GetNoderedInstance completed, status unknown/non existent" + "\n";
                }

                this.messages += "GetNoderedInstance completed, status " + this.instancestatus + "\n";
            } catch (error) {
                this.errormessage = error;
                this.messages += error + "\n";
                this.instancestatus = "";
                console.error(error);
            }
            this.loading = false;
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        async GetNoderedInstanceLog(instancename: string) {
            try {
                this.errormessage = "";
                this.instancestatus = "fetching log";
                console.debug("GetNoderedInstanceLog:");
                this.instancelog = await this.api.GetNoderedInstanceLog(this.userid, instancename);
                this.instancelog = this.instancelog.split("\n").reverse().join("\n");
                this.messages += "GetNoderedInstanceLog completed\n";
                this.instancestatus = "";
            } catch (error) {
                this.errormessage = error;
                this.messages += error + "\n";
                this.instancestatus = "";
                console.error(error);
            }
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        async EnsureNoderedInstance() {
            try {
                this.errormessage = "";
                await this.api.EnsureNoderedInstance(this.userid, this.name);
                this.messages += "EnsureNoderedInstance completed" + "\n";
                this.GetNoderedInstance();
            } catch (error) {
                this.errormessage = error;
                this.messages += error + "\n";
                console.error(error);
            }
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        async DeleteNoderedInstance() {
            try {
                this.errormessage = "";
                await this.api.DeleteNoderedInstance(this.userid, this.name);
                this.messages += "DeleteNoderedInstance completed" + "\n";
                this.GetNoderedInstance();
            } catch (error) {
                this.errormessage = error;
                this.messages += error + "\n";
                console.error(error);
            }
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        async DeleteNoderedPod(instancename: string) {
            try {
                this.errormessage = "";
                await this.api.DeleteNoderedPod(this.userid, instancename);
                this.messages += "DeleteNoderedPod completed" + "\n";
                this.GetNoderedInstance();
            } catch (error) {
                this.errormessage = error;
                this.messages += error + "\n";
                console.error(error);
            }
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        async RestartNoderedInstance() {
            try {
                this.errormessage = "";
                await this.api.RestartNoderedInstance(this.userid, this.name);
                this.messages += "RestartNoderedInstance completed" + "\n";
                this.GetNoderedInstance();
            } catch (error) {
                this.errormessage = error;
                this.messages += error + "\n";
                console.error(error);
            }
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        async StartNoderedInstance() {
            try {
                this.errormessage = "";
                await this.api.StartNoderedInstance(this.userid, this.name);
                this.messages += "StartNoderedInstance completed" + "\n";
                this.GetNoderedInstance();
            } catch (error) {
                this.errormessage = error;
                this.messages += error + "\n";
                console.error(error);
            }
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        async StopNoderedInstance() {
            try {
                this.errormessage = "";
                await this.api.StopNoderedInstance(this.userid, this.name);
                this.messages += "StopNoderedInstance completed" + "\n";
                this.GetNoderedInstance();
            } catch (error) {
                this.errormessage = error;
                this.messages += error + "\n";
                console.error(error);
            }
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
    }




    export class hdrobotsCtrl extends entitiesCtrl<openflow.unattendedclient> {
        constructor(
            public $scope: ng.IScope,
            public $location: ng.ILocationService,
            public $routeParams: ng.route.IRouteParamsService,
            public $interval: ng.IIntervalService,
            public WebSocketClient: WebSocketClient,
            public api: api,
            public userdata: userdata
        ) {
            super($scope, $location, $routeParams, $interval, WebSocketClient, api, userdata);
            this.autorefresh = true;
            console.debug("RolesCtrl");
            this.basequery = { _type: "unattendedclient" };
            this.collection = "openrpa";
            WebSocketClient.onSignedin((user: TokenUser) => {
                this.loadData();
            });
        }
        async DeleteOne(model: any): Promise<any> {
            this.loading = true;
            await this.api.Delete(this.collection, model);
            this.models = this.models.filter(function (m: any): boolean { return m._id !== model._id; });
            this.loading = false;
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        async Enable(model: any): Promise<any> {
            this.loading = true;
            model.enabled = true;
            await this.api.Update(this.collection, model);
            this.loading = false;
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        async Disable(model: any): Promise<any> {
            this.loading = true;
            model.enabled = false;
            await this.api.Update(this.collection, model);
            this.loading = false;
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
    }


    export class RobotsCtrl extends entitiesCtrl<openflow.unattendedclient> {
        public showall: boolean = false;
        public showinactive: boolean = false;
        constructor(
            public $scope: ng.IScope,
            public $location: ng.ILocationService,
            public $routeParams: ng.route.IRouteParamsService,
            public $interval: ng.IIntervalService,
            public WebSocketClient: WebSocketClient,
            public api: api,
            public userdata: userdata
        ) {
            super($scope, $location, $routeParams, $interval, WebSocketClient, api, userdata);
            this.autorefresh = true;
            console.debug("RolesCtrl");
            this.basequery = { _type: "user" };
            this.collection = "users";
            this.postloadData = this.processdata;
            this.preloadData = () => {
                var dt = new Date(new Date().toISOString());
                if (this.showinactive) {
                    if (this.showall) {
                        this.basequery = { _heartbeat: { "$exists": true } };
                    } else {
                        this.basequery = { _rpaheartbeat: { "$exists": true } };
                    }
                } else if (this.showall) {
                    dt.setMinutes(dt.getMinutes() - 1);
                    this.basequery = { _heartbeat: { "$gte": dt } };
                } else {
                    dt.setMinutes(dt.getMinutes() - 1);
                    this.basequery = { _rpaheartbeat: { "$gte": dt } };
                }
            };
            if (this.userdata.data.RobotsCtrl) {
                this.basequery = this.userdata.data.RobotsCtrl.basequery;
                this.collection = this.userdata.data.RobotsCtrl.collection;
                this.baseprojection = this.userdata.data.RobotsCtrl.baseprojection;
                this.orderby = this.userdata.data.RobotsCtrl.orderby;
                this.searchstring = this.userdata.data.RobotsCtrl.searchstring;
                this.basequeryas = this.userdata.data.RobotsCtrl.basequeryas;
                this.showinactive = this.userdata.data.RobotsCtrl.showinactive;
                this.showall = this.userdata.data.RobotsCtrl.showall;
            }
            WebSocketClient.onSignedin((user: TokenUser) => {
                this.loadData();
            });
        }
        processdata() {
            if (!this.userdata.data.RobotsCtrl) this.userdata.data.RobotsCtrl = {};
            this.userdata.data.RobotsCtrl.basequery = this.basequery;
            this.userdata.data.RobotsCtrl.collection = this.collection;
            this.userdata.data.RobotsCtrl.baseprojection = this.baseprojection;
            this.userdata.data.RobotsCtrl.orderby = this.orderby;
            this.userdata.data.RobotsCtrl.searchstring = this.searchstring;
            this.userdata.data.RobotsCtrl.basequeryas = this.basequeryas;
            this.userdata.data.RobotsCtrl.showinactive = this.showinactive;
            this.userdata.data.RobotsCtrl.showall = this.showall;

            for (var i = 0; i < this.models.length; i++) {
                var model: any = this.models[i];
                (model as any).hasnodered = false;
                if (model._noderedheartbeat != undefined && model._noderedheartbeat != null) {
                    var dt = new Date(model._noderedheartbeat)
                    var now: Date = new Date(),
                        secondsPast: number = (now.getTime() - dt.getTime()) / 1000;
                    if (secondsPast < 60) (model as any).hasnodered = true;
                }
            }
            this.loading = false;
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        ShowWorkflows(model: any) {
            this.userdata.data.basequeryas = model._id;
            this.$location.path("/RPAWorkflows");
            if (!this.$scope.$$phase) { this.$scope.$apply(); }

        }
        OpenNodered(model: any) {
            // var name = WebSocketClient.user.username;
            var name = model.username;
            name = name.split("@").join("").split(".").join("");
            name = name.toLowerCase();
            var noderedurl = "https://" + this.WebSocketClient.nodered_domain_schema.replace("$nodered_id$", name);
            window.open(noderedurl);
        }
        ManageNodered(model: any) {
            this.$location.path("/Nodered/" + model._id);
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        async Impersonate(model: openflow.TokenUser): Promise<any> {
            this.loading = true;
            var result = await this.api.SigninWithToken(this.WebSocketClient.jwt, null, model._id);
            this.loading = false;
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }

        // async DeleteOne(model: any): Promise<any> {
        //     this.loading = true;
        //     await this.api.Delete(this.collection, model);
        //     this.models = this.models.filter(function (m: any): boolean { return m._id !== model._id; });
        //     this.loading = false;
        //     if (!this.$scope.$$phase) { this.$scope.$apply(); }
        // }
        // async Enable(model: any): Promise<any> {
        //     this.loading = true;
        //     model.enabled = true;
        //     await this.api.Update(this.collection, model);
        //     this.loading = false;
        //     if (!this.$scope.$$phase) { this.$scope.$apply(); }
        // }
        // async Disable(model: any): Promise<any> {
        //     this.loading = true;
        //     model.enabled = false;
        //     await this.api.Update(this.collection, model);
        //     this.loading = false;
        //     if (!this.$scope.$$phase) { this.$scope.$apply(); }
        // }
    }


    export class AuditlogsCtrl extends entitiesCtrl<openflow.Role> {
        public model: openflow.Role;
        constructor(
            public $scope: ng.IScope,
            public $location: ng.ILocationService,
            public $routeParams: ng.route.IRouteParamsService,
            public $interval: ng.IIntervalService,
            public WebSocketClient: WebSocketClient,
            public api: api,
            public userdata: userdata
        ) {
            super($scope, $location, $routeParams, $interval, WebSocketClient, api, userdata);
            this.autorefresh = false;
            this.baseprojection = { name: 1, type: 1, _type: 1, impostorname: 1, clientagent: 1, clientversion: 1, _created: 1, success: 1 };
            this.searchfields = ["name", "impostorname", "clientagent", "type"];
            console.debug("AuditlogsCtrl");
            // this.basequery = { _type: "role" };
            this.collection = "audit";
            this.postloadData = this.processdata;
            WebSocketClient.onSignedin((user: TokenUser) => {
                this.loadData();
            });
        }
        processdata() {
            for (var i = 0; i < this.models.length; i++) {
                var model: any = this.models[i];
                model.fa = "far fa-question-circle";
                model.fa2 = "";
                if (model.clientagent == 'openrpa') model.fa = 'fas fa-robot';
                if (model.clientagent == 'webapp') model.fa = 'fas fa-globe';
                if (model.clientagent == 'browser') model.fa = 'fas fa-globe';
                if (model.clientagent == 'mobileapp') model.fa = 'fas fa-mobile-alt';
                if (model.clientagent == 'nodered') model.fa = 'fab fa-node-js';
                if (model.clientagent == 'getUserFromRequest') model.fa = 'fab fa-node-js';
                if (model.clientagent == 'googleverify') model.fa = 'fab fa-google';
                if (model.clientagent == 'samlverify') model.fa = 'fab fa-windows';
                if (model.clientagent == 'aiotwebapp') model.fa = 'fas fa-globe';
                if (model.clientagent == 'aiotmobileapp') model.fa = 'fas fa-mobile-alt';

                if (model.impostorname != '' && model.impostorname != null) model.fa2 = 'fas fa-user-secret';
            }
            this.loading = false;
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }

        async ShowAudit(model: any): Promise<any> {
            this.model = null;
            var modal: any = $("#exampleModal");
            modal.modal();
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
            var arr = await this.api.Query(this.collection, { _id: model._id }, null, null, 1);
            if (arr.length == 1) {
                this.model = arr[0];
            }
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
    }


    export class SignupCtrl extends entityCtrl<openflow.Base> {
        searchFilteredList: openflow.TokenUser[] = [];
        searchSelectedItem: openflow.TokenUser = null;
        searchtext: string = "";
        e: any = null;

        public newkey: string = "";
        public showjson: boolean = false;
        public jsonmodel: string = "";
        public message: string = "";
        constructor(
            public $scope: ng.IScope,
            public $location: ng.ILocationService,
            public $routeParams: ng.route.IRouteParamsService,
            public $interval: ng.IIntervalService,
            public WebSocketClient: WebSocketClient,
            public api: api
        ) {
            super($scope, $location, $routeParams, $interval, WebSocketClient, api);
            console.debug("SignupCtrl");
            this.collection = $routeParams.collection;
            this.postloadData = this.processdata;
            WebSocketClient.onConnected(async () => {
                if (this.id !== null && this.id !== undefined) {
                    await this.loadData();
                } else {
                    this.processdata();
                }
            });
        }
        processdata() {
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
    }

    declare var Stripe: any;
    export class PaymentCtrl extends entityCtrl<Billing> {
        public messages: string = "";
        public cardmessage: string = "";
        public errormessage: string = "";
        public stripe: any = null;
        public stripe_customer: stripe_customer;
        public stripe_products: stripe_list<stripe_base>;
        public stripe_plans: stripe_list<stripe_plan>;
        public hastaxtext: string;
        public userid: string;

        public taxstatus: string = "";
        public taxaddress: string = "";
        public hascustomer: boolean = false;
        public allowopenflowsignup: boolean = false;
        public allowsupportsignup: boolean = false;
        public hastaxinfo: boolean = false;
        public openflowplan: stripe_plan;
        public supportplan: stripe_plan;
        public supporthoursplan: stripe_plan;
        public supportsubscription: stripe_subscription_item;
        public supporthourssubscription: stripe_subscription_item;

        public openflowplans: stripe_plan[] = [];
        public supportplans: stripe_plan[] = [];
        public supporthoursplans: stripe_plan[] = [];

        public nextbill: stripe_invoice;

        constructor(
            public $scope: ng.IScope,
            public $location: ng.ILocationService,
            public $routeParams: ng.route.IRouteParamsService,
            public $interval: ng.IIntervalService,
            public WebSocketClient: WebSocketClient,
            public api: api
        ) {
            super($scope, $location, $routeParams, $interval, WebSocketClient, api);
            console.debug("PaymentCtrl");
            //this.collection = $routeParams.collection;
            this.userid = $routeParams.userid;
            this.postloadData = this.processdata;
            this.collection = "users";

            WebSocketClient.onSignedin(async (_user: TokenUser) => {
                if (this.userid == null || this.userid == "" || this.userid == "success" || this.userid == "cancel") {
                    this.userid = _user._id;
                }

                this.basequery = { "userid": this.userid, "_type": "billing" };
                // this.basequery = { "userid": this.userid };
                this.stripe = Stripe(this.WebSocketClient.stripe_api_key);

                this.loadData();
            });
        }
        async processdata() {
            try {

                this.taxstatus = "";
                this.hascustomer = false;
                this.allowopenflowsignup = false;
                this.allowsupportsignup = false;
                this.hastaxinfo = false;

                this.messages = "";
                this.cardmessage = "";
                this.errormessage = "";
                this.stripe = null;
                this.stripe_products = null;
                this.stripe_plans = null;
                this.hastaxtext = "vat included";

                this.taxstatus = "";
                this.taxaddress = "";
                this.hascustomer = false;
                this.allowopenflowsignup = false;
                this.allowsupportsignup = false;
                this.hastaxinfo = false;
                this.openflowplan = null;
                this.supportplan = null;
                this.supporthoursplan = null;
                this.supportsubscription = null;
                this.supporthourssubscription = null;

                this.cardmessage = "";
                if (this.model == null) {
                    this.model = new Billing(this.WebSocketClient.user._id);
                    this.model.name = this.WebSocketClient.user.name;
                    if (this.WebSocketClient.user.username.indexOf("@") > -1) {
                        this.model.email = this.WebSocketClient.user.username;
                    }
                    this.model.tax = 1.0;
                    this.hastaxtext = "excl vat";
                } else {
                    if (this.model != null && this.model.stripeid != null && this.model.stripeid != "") {
                        var payload: stripe_customer = new stripe_customer;
                        this.stripe_customer = await this.api.EnsureStripeCustomer(this.model, this.userid);
                        this.hascustomer = (this.stripe_customer != null);
                        if (this.model.tax != 1) {
                            this.hastaxtext = "vat included";
                        } else {
                            this.hastaxtext = "excl vat";
                        }
                    }
                }
                if (this.stripe_customer && this.stripe_customer) {
                    if (this.stripe_customer.tax_ids.total_count > 0) {
                        this.hastaxinfo = true;
                        this.taxstatus = this.stripe_customer.tax_ids.data[0].verification.status;
                        this.taxaddress = this.stripe_customer.tax_ids.data[0].verification.verified_address;
                        if (this.stripe_customer.tax_ids.data[0].verification.status == 'verified' || this.stripe_customer.tax_ids.data[0].verification.status == 'unavailable') {
                            if (this.stripe_customer.tax_ids.data[0].verification.status == 'verified') {
                                this.model.name = this.stripe_customer.tax_ids.data[0].verification.verified_name;
                                this.model.address = this.stripe_customer.tax_ids.data[0].verification.verified_address;
                            }
                            this.allowopenflowsignup = true;
                            this.allowsupportsignup = true;
                        }
                    } else {
                        this.allowopenflowsignup = true;
                        this.allowsupportsignup = true;
                    }
                }
                //if (this.allowopenflowsignup || this.allowsupportsignup) {
                this.model.taxrate = "";
                if (this.openflowplans.length == 0 && this.supportplans.length == 0) {
                    this.stripe_plans = (await this.api.Stripe("GET", "plans", null, null, null) as any);
                    for (var x = 0; x < this.stripe_plans.data.length; x++) {
                        var stripeplan = this.stripe_plans.data[x];
                        if (stripeplan.metadata.openflowuser == "true") {
                            this.openflowplans.push(stripeplan);
                        }
                        if (stripeplan.metadata.supportplan == "true") {
                            this.supportplans.push(stripeplan);
                        }
                    }
                    for (var y = 0; y < this.supportplans.length; y++) {
                        var supportplan = this.supportplans[y];
                        for (var x = 0; x < this.stripe_plans.data.length; x++) {
                            var stripeplan = this.stripe_plans.data[x];
                            if (stripeplan.id == supportplan.metadata.subplan) {
                                this.supporthoursplans.push(stripeplan);
                                (supportplan as any).subplan = stripeplan;
                            }
                        }

                    }
                }
                //}
                if (this.hascustomer) {
                    var hasOpenflow = this.openflowplans.filter(plan => {
                        var hasit = this.stripe_customer.subscriptions.data.filter(s => {
                            var arr = s.items.data.filter(y => y.plan.id == plan.id);
                            if (arr.length == 1) {
                                if (arr[0].quantity > 0) {
                                    // this.openflowplan = arr[0];
                                    return true;
                                }
                            }
                            return false;
                        });
                        if (hasit.length > 0) return true;
                        return false;
                        // var hasit = this.stripe_customer.subscriptions.data.filter(s => s.items.data.filter(y => y.plan.id == plan.id).length > 0);
                        // if (hasit.length > 0) return true;
                        // return false;
                    });
                    if (hasOpenflow.length > 0) {
                        this.allowopenflowsignup = false;
                        this.openflowplan = hasOpenflow[0];
                    }
                    var hasSupport = this.supportplans.filter(plan => {
                        var hasit = this.stripe_customer.subscriptions.data.filter(s => {
                            var arr = s.items.data.filter(y => y.plan.id == plan.id);
                            if (arr.length == 1) {
                                if (arr[0].quantity > 0) {
                                    this.supportsubscription = arr[0];
                                    return true;
                                }
                            }
                            return false;
                        });
                        if (hasit.length > 0) return true;
                        return false;
                    });
                    if (hasSupport.length > 0) {
                        this.allowsupportsignup = false;
                        this.supportplan = hasSupport[0];
                    }
                    var hasSupportHours = this.supporthoursplans.filter(plan => {
                        var hasit = this.stripe_customer.subscriptions.data.filter(s => {
                            var arr = s.items.data.filter(y => y.plan.id == plan.id);
                            if (arr.length == 1) {
                                //if (arr[0].quantity > 0) {
                                this.supporthourssubscription = arr[0];
                                return true;
                                //}
                            }
                            return false;
                        });
                        if (hasit.length > 0) return true;
                        return false;
                    });
                    if (hasSupportHours.length > 0) {
                        this.allowsupportsignup = false;
                        this.supporthoursplan = hasSupportHours[0];
                    } else if (this.supportplan != null) {
                        this.supporthoursplan = (this.supportplan as any).subplan;
                        var subscriptions = this.stripe_customer.subscriptions.data.filter(s => {
                            var arr = s.items.data.filter(y => y.plan.id == this.supportplan.id);
                            return arr.length > 0;
                        });
                        var subscription = subscriptions[0];
                        // (payload as any) = { subscription: subscription.id, plan: this.supporthoursplan.id, quantity: 1 };
                        (payload as any) = { subscription: subscription.id, plan: this.supporthoursplan.id };

                        // await this.api.Stripe("POST", "subscription_items", null, null, payload);
                        var result = await this.api.StripeAddPlan(this.userid, this.supporthoursplan.id, null);
                        // this.loadData();
                    }
                }


                if (this.stripe_customer && this.stripe_customer) {
                    try {
                        this.nextbill = (await this.api.Stripe<stripe_invoice>("GET", "invoices_upcoming", this.stripe_customer.id, null, null) as any);
                        this.nextbill.dtperiod_start = new Date(this.nextbill.period_start * 1000);
                        this.nextbill.dtperiod_end = new Date(this.nextbill.period_end * 1000);
                    } catch (error) {
                        console.error(error);
                    }
                }

            } catch (error) {
                console.error(error);
                this.cardmessage = error;
            }
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        async Save() {
            try {
                // await this.api.Update(this.collection, this.model);
                var customer: stripe_customer = null;

                if (customer == null && this.model.name != null) {
                    customer = await this.api.EnsureStripeCustomer(this.model, this.userid);
                }

                this.loadData();
            } catch (error) {
                console.error(error);
                this.cardmessage = error;
            }
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        async CancelPlan(planid: string) {
            try {
                var result = await this.api.StripeCancelPlan(this.userid, planid);
                this.loadData();
            } catch (error) {
                console.error(error);
                this.cardmessage = error;
            }
            if (!this.$scope.$$phase) { this.$scope.$apply(); }

        }
        async AddHours(plan: string) {
            try {
                if (this.supporthourssubscription == null) return;
                var hours: number = parseInt(window.prompt("Number of hours", "1"));
                if (hours > 0) {
                    var dt = parseInt((new Date().getTime() / 1000).toFixed(0))
                    var payload: any = { "quantity": hours, "timestamp": dt };
                    var res = await this.api.Stripe("POST", "usage_records", null, this.supporthourssubscription.id, payload);
                }
                this.loadData();
            } catch (error) {
                console.error(error);
                this.cardmessage = error;
            }
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        async CheckOut(planid: string, subplanid: string) {
            try {
                var result = await this.api.StripeAddPlan(this.userid, planid, subplanid);
                if (result.checkout) {
                    var stripe = Stripe(this.WebSocketClient.stripe_api_key);
                    stripe
                        .redirectToCheckout({
                            sessionId: result.checkout.id,
                        })
                        .then(function (event) {
                            if (event.complete) {
                                // enable payment button
                            } else if (event.error) {
                                console.error(event.error);
                                if (event.error && event.error.message) {
                                    this.cardmessage = event.error.message;
                                } else {
                                    this.cardmessage = event.error;
                                }
                                console.error(event.error);

                                // show validation to customer
                            } else {
                            }
                        }).catch((error) => {
                            console.error(error);
                            this.cardmessage = error;
                        });
                } else {
                    this.loadData();
                }
            } catch (error) {
                console.error(error);
                this.cardmessage = error;
            }
            if (!this.$scope.$$phase) { this.$scope.$apply(); }

        }
    }
}
