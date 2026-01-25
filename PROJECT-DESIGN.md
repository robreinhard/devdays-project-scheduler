# Devdays Jira GANTT Chart

The purpose of this document is to help outline my thought process for what I'm trying to build.

## Project Statement

Hy-Vee has a "unique" way of project estimations, one that is hard to automate with
basic tools. This drives me crazy, as it's hard to do project estimates.

The purpose of this tool is to build a gannt chart based on custom JIRA fields to help
better estimate timelines. 

## Definitions, Plan:

### Dev Days

Hy-Vee's internal metric for measuring metrics is called a "Dev Day". 
A dev day is an estimate, and corresponds to 5 hours of developer work.

When estimating, a column called "Story Points" is used which corresponds
to the number of dev days. Examples. 

| Dev Day Value | Hours |
|---------------|-------|
| 1             | 5     |
| 2             | 10    |
| 3             | 15    |
| 4             | 20    |

This means you can get an estimated number of dev days through this formula:
`hours / 5 = dev days`

And the total number of hours as `dev days * 5 = hours`

You CANNOT throw more devs to complete a dev day. A dev day is defined as the time
required for 1 DEVELOPER to complete work. It does not scale

### Project Timeline Numbering System (Linear vs Parallelized Order)

GANTT charts use a numbering system to indicate order.

At Hy-Vee, I'm hoping we can set up a custom property to indicate order.

Each number represents a linear order in which work must be completed.
Numbers can sometimes be equal, which indicates parallelism.

All tickets under an EPIC will indicate linear order.
EPICS/Initiatives can be linearly ordered as well.

### Sprints

Each sprint will have a custom property indicating the 
"TOTAL NUMBER OF DEV DAYS" accounted for in that sprint.

### Putting this Together

With these two definitions I can build custom gantt chart software
that works with JIRA to define project timelines.

#### Inputs

The software would take in the following properties

1. Epics
2. Sprints

##### Epics

Each epic will be pulled down and all associated tickets.
This would define your most basic GANTT chart per epic.

There is a "best case" and "worst case" for a project timeline.

| Timeline Estimate | Definition                                     |
|-------------------|------------------------------------------------|
| Best Case         | All parallel tickets are executed in parallel. |
| Worst Case        | All parallel tickets are executed linearly.    |

##### Sprints

In JIRA, by default each sprint has a "Start Date" and "End Date".
We also have the "total number of dev days" per sprint.

When you have multiple projects going at the same time,
and a limited amount of resources, you cannot assume best case
for every epic. The purpose of the sprints will be to help
slot all epic's with respect to each epic's project timeline numbering 
system
to help complete **ALL** epics in the specified timeline.

## Engineering

### Overview:

The system will be a next.js application that connects via API
to JIRA. There will be no client side data store. 

All inputs will be saved as query params.

### Technologies:

By default, this application will use the following yarn packages

| Package          | Use Case                      |
|------------------|-------------------------------|
| @mui/material    | Component library             |
| @emotion/react   | UI Theming, Component Styling |
| @emotion/styled  | UI Theming, Component Styling |

As stated previously, the API will connect directly to JIRA to pull back epics
and sprints and slot tickets accordingly.

### GANNT Chart Design

The Y axis will be EPICs and all ticket under each epic.
The epic will be collapsible.

The X axis will have both a date and the "day." These align
with sprint start and end dates, which are also on the X axis.

To implement this GANNT chart, we will use the MUI system,
but more importantly, flexbox to help with column sizing.

The GANTT chart will be scrollable as you work through each project.

## Implementation Plan

The implementation plan will need to be as follows:

1. Set up API endpoints to get stories by epic
   2. The web app will need to verify all epics are "valid". And throw a warning/error message if not the case.
2. All sprints by project space
   3. The users will select the relevant epics for slotting stories.
4. Build the gantt chart (in react)
   5. A "start date" and "end date" should be additional inputs for sizing the gantt chart
   6. Tickets will show with linear order and there will be a flexible line connecting them like a gantt chart
   7. JIRA ticket should be linkable to JIRA



