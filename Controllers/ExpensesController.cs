using ExpenseTrackerApi.Data;
using ExpenseTrackerApi.Dtos;
using ExpenseTrackerApi.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
namespace ExpenseTrackerApi.Controllers;
[ApiController]
[Route("api/expenses")]
public class ExpensesController(ExpenseDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IEnumerable<ExpenseResponse>>> GetAll(CancellationToken ct)
    {
        var rows = await db.Expenses.AsNoTracking().OrderByDescending(e => e.Date).ThenByDescending(e => e.Id).ToListAsync(ct);
        return Ok(rows.Select(ToResponse));
    }
    [HttpGet("{id:int}")]
    public async Task<ActionResult<ExpenseResponse>> GetById(int id, CancellationToken ct)
    {
        var row = await db.Expenses.AsNoTracking().FirstOrDefaultAsync(e => e.Id == id, ct);
        return row is null ? NotFound() : Ok(ToResponse(row));
    }
    [HttpPost]
    public async Task<ActionResult<ExpenseResponse>> Create(ExpenseRequest request, CancellationToken ct)
    {
        var row = new Expense();
        Apply(request, row);
        db.Expenses.Add(row);
        await db.SaveChangesAsync(ct);
        return CreatedAtAction(nameof(GetById), new { id = row.Id }, ToResponse(row));
    }
    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, ExpenseRequest request, CancellationToken ct)
    {
        var row = await db.Expenses.FindAsync([id], ct);
        if (row is null) return NotFound();
        Apply(request, row);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        var row = await db.Expenses.FindAsync([id], ct);
        if (row is null) return NotFound();
        db.Expenses.Remove(row);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }
    private static void Apply(ExpenseRequest request, Expense row)
    {
        row.Title = request.Title.Trim(); row.Category = request.Category.Trim();
        row.Amount = request.Amount; row.Date = request.Date!.Value.ToDateTime(TimeOnly.MinValue);
    }
    private static ExpenseResponse ToResponse(Expense row) => new(row.Id, row.Title, row.Amount, row.Category, DateOnly.FromDateTime(row.Date));
}
